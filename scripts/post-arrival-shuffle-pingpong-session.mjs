/**
 * Session-based Shuffle ping-pong post-arrival stability (no full reload per hop).
 * Usage:
 *   node scripts/post-arrival-shuffle-pingpong-session.mjs --base http://127.0.0.1:3010 --out <dir> --repeat 20
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { evaluatePostArrivalShuffleStabilityGate } from "./post-arrival-shuffle-stability-core.mjs";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1] ?? null;
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

const base = argValue("--base") || "http://127.0.0.1:3010";
const out =
  argValue("--out") ||
  path.join("scripts", "ghost-filmstrip-out", `post-arrival-pingpong-${Date.now()}`);
const repeat = Math.max(1, Number(argValue("--repeat") || "20") || 20);
const PROVIDER = "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST";
fs.mkdirSync(out, { recursive: true });

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function dismissLegal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.evaluate(() =>
      document.body.classList.contains("sayittome-entry-legal-open"),
    );
    if (!open) return;
    await page.evaluate(() => {
      const declare = document.querySelector(
        ".sayittome-entry-legal-scroll button:last-of-type",
      );
      declare?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      declare?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      declare?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const accept = document.querySelector(
        ".sayittome-entry-legal-actions button:last-of-type",
      );
      accept?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      accept?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      accept?.click();
    });
    await page.waitForTimeout(600);
  }
}

async function tap(page, dest) {
  await dismissLegal(page);
  const started = Date.now();
  while (Date.now() - started < 12000) {
    const result = await page.evaluate((d) => {
      const tabs = [...document.querySelectorAll("[data-nav-tab]")].map((el) =>
        el.getAttribute("data-nav-tab"),
      );
      const el = document.querySelector(`[data-nav-tab="${d}"]`);
      if (!el) {
        return {
          ok: false,
          tabs,
          path: location.pathname,
          legal: document.body.classList.contains("sayittome-entry-legal-open"),
        };
      }
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.click();
      return { ok: true, tabs, path: location.pathname, legal: false };
    }, dest);
    if (result.ok) return;
    if (result.legal) await dismissLegal(page);
    await page.waitForTimeout(80);
  }
  const diag = await page.evaluate(() => ({
    path: location.pathname,
    tabs: [...document.querySelectorAll("[data-nav-tab]")].map((el) =>
      el.getAttribute("data-nav-tab"),
    ),
    legal: document.body.classList.contains("sayittome-entry-legal-open"),
    body: [...document.body.classList],
  }));
  throw new Error(`missing-tab:${dest} diag=${JSON.stringify(diag)}`);
}

async function sample(page) {
  return page.evaluate(() => {
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    const list = host?.querySelector("[data-shuffle-list]");
    const cards = list
      ? [...list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")]
      : [];
    const mainVisible = [...document.querySelectorAll(".sayittome-main-tab-keepalive-visible")].filter(
      (el) => {
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.04;
      },
    ).length;
    const cardIds = cards
      .map((el) => el.getAttribute("data-profile-id") || el.getAttribute("data-uid") || "")
      .filter(Boolean)
      .slice(0, 8);
    return {
      pathname: location.pathname,
      hostVisible: !!host?.classList.contains("sayittome-shuffle-keepalive-visible"),
      hostFrozen: !!host?.classList.contains("sayittome-shuffle-keepalive-frozen"),
      bridge: document.documentElement.hasAttribute("data-post-settle-route-bridge"),
      slideAttr: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
      slots: cards.length,
      cardIds,
      mainVisible,
      loadingTextAnywhere: /Cargando\.\.\.|Loading\.\.\./i.test(document.body.innerText || ""),
      blackRoot:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "black",
      presentedNone:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "none",
      visualHash: [
        location.pathname,
        host?.classList.contains("sayittome-shuffle-keepalive-visible") ? "V" : "F",
        String(cards.length),
        cardIds.join("|"),
        String(mainVisible),
      ].join("::"),
    };
  });
}

async function waitPath(page, dest, timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const p = await page.evaluate(() => location.pathname);
    if (p === `/${dest}` || p.endsWith(`/${dest}`)) return true;
    await page.waitForTimeout(20);
  }
  return false;
}

async function waitArrival(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const s = await sample(page);
    if (
      s.pathname.includes("shuffle") &&
      s.hostVisible &&
      !s.hostFrozen &&
      !s.bridge &&
      !s.slideAttr &&
      s.slots >= 3
    ) {
      return s;
    }
    await page.waitForTimeout(16);
  }
  return sample(page);
}

async function ensureOnShuffleWithNav(page) {
  for (let i = 0; i < 4; i += 1) {
    await dismissLegal(page);
    const state = await page.evaluate(() => ({
      path: location.pathname,
      tabs: [...document.querySelectorAll("[data-nav-tab]")].map((el) =>
        el.getAttribute("data-nav-tab"),
      ),
    }));
    if (
      state.path.includes("shuffle") &&
      state.tabs.includes("chats") &&
      state.tabs.includes("boost") &&
      state.tabs.includes("shuffle")
    ) {
      return;
    }
    await page.goto(`${base}/chats?navcapture=1&_ensure=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.evaluate(() => {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    });
    await dismissLegal(page);
    await page.locator("[data-nav-tab]").first().waitFor({ state: "attached", timeout: 15_000 });
    await tap(page, "shuffle");
    await waitPath(page, "shuffle", 12000);
    await waitArrival(page);
  }
  throw new Error("ensure-on-shuffle-failed");
}

async function measureReturn(page, via, idx) {
  await ensureOnShuffleWithNav(page);
  await tap(page, via);
  if (!(await waitPath(page, via, 15000))) {
    const diag = await sample(page);
    throw new Error(`via-timeout:${via} diag=${JSON.stringify(diag)}`);
  }
  // settle main tab (exit latch / prepaint may keep shuffle host briefly)
  const settleStart = Date.now();
  while (Date.now() - settleStart < 8000) {
    const s = await sample(page);
    if (
      s.pathname.includes(`/${via}`) &&
      !s.bridge &&
      !s.slideAttr &&
      (s.mainVisible > 0 || s.hostFrozen)
    ) {
      break;
    }
    await page.waitForTimeout(32);
  }
  await page.waitForTimeout(250);
  await tap(page, "shuffle");
  if (!(await waitPath(page, "shuffle", 12000))) {
    throw new Error("return-shuffle-timeout");
  }
  const arrival = await waitArrival(page);
  const series = [];
  const t0 = Date.now();
  for (const off of [0, 50, 100, 200, 400, 700, 1000]) {
    const wait = Math.max(0, off - (Date.now() - t0));
    if (wait) await page.waitForTimeout(wait);
    series.push({ offsetMs: off, ...(await sample(page)) });
  }
  const first = series[0];
  const flashFrames = series.filter(
    (s) =>
      (s.hostFrozen && !s.bridge) ||
      (!s.hostVisible && s.mainVisible > 0 && s.pathname.includes("shuffle")),
  );
  const hostStable = series.every(
    (s) => s.pathname.includes("shuffle") && s.hostVisible && !s.hostFrozen,
  );
  const hashStable = series.every((s) => s.visualHash === first.visualHash);
  const resultStable = series.every(
    (s) => !first.cardIds.length || s.cardIds.join("|") === first.cardIds.join("|"),
  );
  const slotStable = series.every((s) => s.slots === first.slots);
  const gate = evaluatePostArrivalShuffleStabilityGate({
    CAPTURE_PROVIDER_SELECTED: PROVIDER,
    postArrivalFlashCount: flashFrames.length,
    loadingTextAnywhereCount: series.filter((s) => s.loadingTextAnywhere).length,
    visualHashStableAfterArrival: hashStable,
    shuffleDomIdentityStable: hostStable,
    shuffleResultIdentityStable: resultStable,
    shuffleSlotIdentityStable: slotStable,
    poolRefetchVisibleDuringSettle: !resultStable,
    blackRoot: series.some((s) => s.blackRoot),
    presentedNone: series.some((s) => s.presentedNone),
  });
  const report = {
    via,
    idx,
    arrival,
    series,
    flashFrames: flashFrames.length,
    hostStable,
    hashStable,
    resultStable,
    slotStable,
    gate,
  };
  writeJson(path.join(out, `pingpong-${via}-${idx}.json`), report);
  return report;
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv",
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(`${base}/chats?navcapture=1&_pp=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 90_000,
});
await page.evaluate(() => {
  localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
});
await page.waitForTimeout(1000);
await dismissLegal(page);
await page.locator("[data-nav-tab]").first().waitFor({ state: "attached", timeout: 20_000 });

// Warm: land on Shuffle once
await tap(page, "shuffle");
await waitPath(page, "shuffle", 12000);
await waitArrival(page);

const vias = ["chats", "boost"];
const results = [];
for (const via of vias) {
  for (let i = 0; i < repeat; i += 1) {
    try {
      results.push(await measureReturn(page, via, i));
    } catch (err) {
      const fail = {
        via,
        idx: i,
        error: String(err?.message || err),
        gate: { pass: false, status: "PROBE_ERROR" },
        flashFrames: 0,
      };
      results.push(fail);
      writeJson(path.join(out, `pingpong-${via}-${i}-error.json`), fail);
      // recover to shuffle without hard home navigation
      try {
        await dismissLegal(page);
        const pathNow = await page.evaluate(() => location.pathname);
        if (!pathNow.includes("shuffle")) {
          if (pathNow === "/" || !pathNow.includes(via)) {
            await page.goto(`${base}/chats?navcapture=1&_recover=${Date.now()}`, {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            });
            await dismissLegal(page);
          }
          await tap(page, "shuffle");
        }
        await waitArrival(page);
      } catch {
        /* ignore */
      }
    }
  }
}

await browser.close();

const pass = results.filter((r) => r.gate?.pass).length;
const fail = results.length - pass;
const flash = results.reduce((n, r) => n + Number(r.flashFrames || 0), 0);
const summary = {
  base,
  repeat,
  total: results.length,
  pass,
  fail,
  postArrivalFlashCount: flash,
  byVia: vias.map((via) => {
    const subset = results.filter((r) => r.via === via);
    return {
      via,
      pass: subset.filter((r) => r.gate?.pass).length,
      fail: subset.filter((r) => !r.gate?.pass).length,
      flash: subset.reduce((n, r) => n + Number(r.flashFrames || 0), 0),
    };
  }),
  POST_ARRIVAL_SHUFFLE_STABILITY_GATE: fail === 0 && flash === 0,
  status:
    fail === 0 && flash === 0
      ? "POST_ARRIVAL_PINGPONG_SESSION_PASS"
      : "SHUFFLE_POST_ARRIVAL_FLASH_TARGETED_VALIDATION_FAILED",
};

writeJson(path.join(out, "pingpong-session-summary.json"), summary);
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.POST_ARRIVAL_SHUFFLE_STABILITY_GATE ? 0 : 1);
