/**
 * Same-browser repro: one Chromium profile, two tabs, real UI.
 *   node scripts/_tmp-same-browser-two-tab-repro.mjs
 */
import { chromium } from "playwright";

const HOST = process.env.REPRO_HOST || "https://sayittome-app.web.app";
const HEADLESS = process.env.REPRO_HEADED !== "1";

function log(obj) {
  console.log(JSON.stringify(obj));
}

async function instrument(page, tag) {
  const state = { tag, bind: [], requests: [], incoming: [], presence: [] };

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    let body = null;
    try {
      body = await res.json();
    } catch {
      return;
    }
    if (url.includes("/api/anon-match/bind-alias")) {
      state.bind.push(String(body?.anonId || body?.error || ""));
    } else if (url.includes("/api/anonymous-presence")) {
      state.presence.push({
        m: res.request().method(),
        s: res.status(),
        ok: body?.ok,
        anonId: String(body?.anonId || "").slice(0, 14),
      });
    } else if (url.includes("/api/anon-match/request")) {
      state.requests.push({
        m: res.request().method(),
        s: res.status(),
        ok: body?.ok,
        anonId: body?.anonId ? String(body.anonId).slice(0, 14) : null,
        available: body?.available ?? null,
        error: body?.error || null,
      });
    } else if (url.includes("/api/anon-match/incoming")) {
      for (const row of Array.isArray(body?.incoming) ? body.incoming : []) {
        const from = String(row?.solicitanteAnonId || row?.solicitanteUid || "");
        if (from && !state.incoming.includes(from)) state.incoming.push(from);
      }
    }
  });

  return state;
}

async function readIdentity(page) {
  return page.evaluate(() => {
    const out = { alias: "", authUid: "", legalSession: "", legalUnlock: "", persistence: "" };
    try {
      out.alias = sessionStorage.getItem("sayittome_anon_match_server_alias") || "";
      out.legalSession = sessionStorage.getItem("sayittome_anon_legal_accepted_v1") || "";
      out.legalUnlock = sessionStorage.getItem("sayittome:shuffle:legal-unlocked:v1") || "";
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i) || "";
        if (k.startsWith("firebase:authUser:")) {
          out.persistence = "session";
          try {
            out.authUid = JSON.parse(sessionStorage.getItem(k) || "{}").uid || "";
          } catch {}
        }
      }
    } catch {}
    return out;
  });
}

async function dismissLanguageModal(page, tag) {
  for (const name of [/Mantener Espa/i, /^Espa\u00f1ol$/i]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => null);
      log({ tag, step: "language_modal_dismissed" });
      await page.waitForTimeout(1_000);
    }
  }
}

async function enterAnon(page, tag) {
  await page.goto(`${HOST}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await dismissLanguageModal(page, tag);

  const toggle = page.locator("[data-legal-accept-toggle]");
  try {
    await toggle.waitFor({ state: "visible", timeout: 25_000 });
    await toggle.click();
    await page.locator("[data-legal-accept-submit]").click();
    log({ tag, step: "legal_accepted" });
  } catch {
    const shot = `scripts/_tmp-repro-${tag}-no-legal.png`;
    await page.screenshot({ path: shot, fullPage: false }).catch(() => null);
    const text = (await page.locator("body").innerText().catch(() => "")) || "";
    log({
      tag,
      step: "legal_modal_absent",
      url: page.url(),
      shot,
      bodyText: text.replace(/\s+/g, " ").slice(0, 400),
    });
  }

  await page.waitForTimeout(8_000);
  const identity = await readIdentity(page);
  log({ tag, step: "identity", ...identity });
  return identity;
}

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({ locale: "es-AR" });

const pageA = await context.newPage();
const stateA = await instrument(pageA, "A");
const pageB = await context.newPage();
const stateB = await instrument(pageB, "B");

const idA = await enterAnon(pageA, "A");
const idB = await enterAnon(pageB, "B");

log({
  step: "isolation_check",
  sameAlias: Boolean(idA.alias) && idA.alias === idB.alias,
  sameUid: Boolean(idA.authUid) && idA.authUid === idB.authUid,
  aDoorOpen: idA.legalSession === "1" || idA.legalUnlock === "1",
  bDoorOpen: idB.legalSession === "1" || idB.legalUnlock === "1",
});

// A searches through the real UI.
await pageA.bringToFront();
await dismissLanguageModal(pageA, "A");
await dismissLanguageModal(pageB, "B");
try {
  const cta = pageA.getByRole("button", { name: "Conectar", exact: true }).first();
  await cta.scrollIntoViewIfNeeded({ timeout: 10_000 });
  await cta.click({ timeout: 10_000, force: true });
  log({ tag: "A", step: "cta_clicked" });

  const confirm = pageA.getByRole("button", { name: /Entendido, buscar/i }).first();
  await confirm.waitFor({ state: "visible", timeout: 10_000 });
  await confirm.click({ force: true });
  log({ tag: "A", step: "confirm_clicked" });
} catch (e) {
  const shot = "scripts/_tmp-repro-A-cta-failed.png";
  await pageA.screenshot({ path: shot }).catch(() => null);
  const text = (await pageA.locator("body").innerText().catch(() => "")) || "";
  log({
    tag: "A",
    step: "cta_failed",
    shot,
    error: String(e).slice(0, 160),
    bodyText: text.replace(/\s+/g, " ").slice(0, 400),
  });
}

let sawModal = false;
for (let i = 0; i < 24; i += 1) {
  await pageA.waitForTimeout(2_000);
  const visible = await pageB
    .getByText("Encontramos un chat para vos.")
    .isVisible()
    .catch(() => false);
  if (visible) {
    sawModal = true;
    log({ tag: "B", step: "incoming_modal_visible", afterSeconds: (i + 1) * 2 });
    break;
  }
}

// A must have actually targeted B — a random prod stranger would be a false pass.
const okRequests = stateA.requests.filter((r) => r.ok);
const failedRequests = stateA.requests.filter((r) => r.ok === false);
const targetedB = okRequests.some((r) => idB.alias.startsWith(String(r.anonId || "\u0000")));
const alertCameFromA = stateA.requests.length > 0 && stateB.incoming.includes(idA.alias);
const aliasErrors = [
  ...stateA.requests.filter((r) => /alias/i.test(String(r.error || ""))),
  ...stateA.presence.filter((p) => p.ok === false),
  ...stateB.presence.filter((p) => p.ok === false),
];

const pass = sawModal && targetedB && alertCameFromA && aliasErrors.length === 0;
log({
  gate: "SAME_BROWSER_TWO_TAB",
  pass,
  sawModal,
  targetedB,
  alertCameFromA,
  failedRequests,
  aliasErrorCount: aliasErrors.length,
  A: { requests: stateA.requests, presenceOk: stateA.presence.every((p) => p.ok) },
  B: { incomingFrom: stateB.incoming, presenceOk: stateB.presence.every((p) => p.ok) },
});
if (!pass) process.exitCode = 1;

await browser.close();
