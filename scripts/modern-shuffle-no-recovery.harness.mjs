/**
 * Live modern Shuffle must not show the recovery ("Recuperación") shell.
 * Covers: direct /shuffle, Stories→Shuffle, Chats→Shuffle, Profile→Shuffle,
 * hard refresh, and auth-settled modern mode.
 *
 * Usage:
 *   node scripts/modern-shuffle-no-recovery.harness.mjs --base http://127.0.0.1:3000
 */
import { chromium, devices } from "playwright";

const baseArg = process.argv.indexOf("--base");
const base =
  (baseArg >= 0 && process.argv[baseArg + 1]) || "http://127.0.0.1:3000";

async function acceptLegalIfNeeded(page) {
  const legalToggle = page.locator("[data-legal-accept-toggle='1']");
  if (await legalToggle.count()) {
    await legalToggle.click({ force: true });
    const accept = page
      .locator("button")
      .filter({ hasText: /Acepto|Accept/i })
      .first();
    if (await accept.count()) await accept.click({ force: true });
    await page.waitForTimeout(800);
  }
}

async function forceModern(page) {
  await page.evaluate(() => {
    localStorage.setItem("sayittome_ux_mode", "modern");
    localStorage.setItem("sayittome_locale_prompt_done", "1");
    localStorage.setItem(
      "sayittome-chat-notification-prefs",
      JSON.stringify({ enabled: false, prompted: true }),
    );
  });
}

async function snapShuffle(page) {
  return page.evaluate(() => {
    const errShell = document.querySelector('[data-shuffle-error-shell="1"]');
    const list = document.querySelector("[data-shuffle-list]");
    const slots = document.querySelectorAll(
      "[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)",
    ).length;
    const hosts = document.querySelectorAll(
      "#sayittome-shuffle-keepalive-host",
    ).length;
    const apiHits =
      typeof window.__sayittomeShuffleApiHits === "number"
        ? window.__sayittomeShuffleApiHits
        : null;
    return {
      mode: localStorage.getItem("sayittome_ux_mode"),
      dataUx: document.documentElement.getAttribute("data-ux"),
      hasErrorShell: Boolean(errShell),
      bodyHasRecuperacion: /Recuperaci[oó]n/i.test(document.body.innerText),
      bodyHasProblema: /tuvo un problema/i.test(document.body.innerText),
      hasList: Boolean(list),
      slotCount: slots,
      hostCount: hosts,
      pathname: location.pathname,
      apiHits,
      textSlice: document.body.innerText.replace(/\s+/g, " ").slice(0, 280),
    };
  });
}

function casePass(snap) {
  return (
    snap.mode === "modern" &&
    !snap.hasErrorShell &&
    !snap.bodyHasRecuperacion &&
    !snap.bodyHasProblema &&
    snap.hostCount <= 1 &&
    (snap.hasList || /Visibles|Perfiles|Shuffle|Cargando|Preparando/i.test(snap.textSlice))
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  serviceWorkers: "block",
});
await context.addInitScript(() => {
  localStorage.setItem("sayittome_ux_mode", "modern");
  localStorage.setItem("sayittome_locale_prompt_done", "1");
  localStorage.setItem(
    "sayittome-chat-notification-prefs",
    JSON.stringify({ enabled: false, prompted: true }),
  );
  window.__sayittomeShuffleApiHits = 0;
  const origFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = String(args[0] || "");
    if (url.includes("/api/shuffle")) {
      window.__sayittomeShuffleApiHits += 1;
    }
    return origFetch(...args);
  };
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

const cases = [];

async function runCase(label, fn) {
  const beforeHits = await page.evaluate(
    () => window.__sayittomeShuffleApiHits || 0,
  );
  await fn();
  await page.waitForTimeout(2200);
  const snap = await snapShuffle(page);
  const afterHits = await page.evaluate(
    () => window.__sayittomeShuffleApiHits || 0,
  );
  cases.push({
    label,
    ...snap,
    shuffleGetsDelta: afterHits - beforeHits,
    pageErrors: pageErrors.slice(),
    pass: casePass(snap),
  });
  pageErrors.length = 0;
}

await runCase("direct /shuffle hard entry", async () => {
  await page.goto(`${base}/shuffle?qaDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await acceptLegalIfNeeded(page);
  await forceModern(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await acceptLegalIfNeeded(page);
});

await runCase("hard refresh on /shuffle", async () => {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await acceptLegalIfNeeded(page);
});

for (const from of ["/stories", "/chats", "/settings"]) {
  await runCase(`nav ${from} → /shuffle`, async () => {
    await page.goto(`${base}${from}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(600);
    await page.goto(`${base}/shuffle`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  });
}

await runCase("history back/forward", async () => {
  await page.goto(`${base}/stories`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.goto(`${base}/shuffle`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(400);
  await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
});

const report = {
  gate: "MODERN_SHUFFLE_NO_RECOVERY",
  base,
  cases,
  pass: cases.every((c) => c.pass),
  anyRecovery: cases.some(
    (c) => c.hasErrorShell || c.bodyHasRecuperacion || c.bodyHasProblema,
  ),
  maxHosts: Math.max(...cases.map((c) => c.hostCount || 0)),
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.pass) process.exitCode = 1;
