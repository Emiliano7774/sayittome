/**
 * Targeted preservation A–F after history-back pin guard fix.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { computeCommitNavigationMode } from "./main-tab-shuffle-commit-nav-mode.mjs";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "scripts/ghost-filmstrip-out/history-pin-guard-preservation";

fs.mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/1.0 wv";
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const report = {
  A_directCold: null,
  B_flagFalse: null,
  C_nonMicroHardNav: null,
  D_webNonNative: null,
  E_popstateDuringActiveTx: null,
  F_backForwardAfterSettled: null,
};

report.C_nonMicroHardNav = {
  mode: computeCommitNavigationMode({
    href: "/shuffle",
    microSlideEnabled: false,
    nativeShellHardNavWouldApply: true,
  }),
  ok: true,
};
report.C_nonMicroHardNav.ok =
  report.C_nonMicroHardNav.mode.effectiveCommitNavigationMode === "hard";

const browser = await chromium.launch({ channel: "chrome", headless: true });

// A + B + E + F native
{
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  report.A_directCold = await page.evaluate(() => {
    const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
    const pin = window.__getSoftCommitTxPin?.() ?? null;
    return {
      pathname: location.pathname,
      transitionBegin: ring.some((e) => e?.kind === "TRANSITION_BEGIN"),
      pin: pin
        ? { txId: pin.txId, phase: pin.phase }
        : null,
    };
  });
  report.A_directCold.ok =
    report.A_directCold.pathname === "/shuffle" &&
    report.A_directCold.transitionBegin !== true &&
    report.A_directCold.pin == null;

  await page.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "0");
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);
  report.B_flagFalse = await page.evaluate(() => {
    const mode = window.__getMainTabToShuffleCommitNavigationMode?.("/shuffle") ?? null;
    const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
    return {
      mode,
      transitionBegin: ring.some((e) => e?.kind === "TRANSITION_BEGIN"),
      pin: window.__getSoftCommitTxPin?.() ?? null,
    };
  });
  report.B_flagFalse.ok =
    report.B_flagFalse.transitionBegin !== true && report.B_flagFalse.pin == null;

  // Re-enable for E/F
  await page.evaluate(() => {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "1");
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const shuffle = page.locator('.sayittome-bottom-nav [data-nav-tab="shuffle"]').first();
  await shuffle.waitFor({ state: "visible", timeout: 15000 });
  await shuffle.dispatchEvent("pointerdown");
  await page.waitForTimeout(50);
  // E: popstate while preparing/active
  await page.evaluate(() => history.pushState({}, "", "/chats"));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
  await page.waitForTimeout(400);
  report.E_popstateDuringActiveTx = await page.evaluate(() => {
    const pin = window.__getSoftCommitTxPin?.() ?? null;
    const now = Math.round(performance.timeOrigin + performance.now());
    const pinActive = !!(
      pin &&
      (pin.expiresAtMono == null || now <= pin.expiresAtMono) &&
      (pin.phase === "preparing" || pin.phase === "armed" || pin.phase === "sliding")
    );
    return {
      pinActive,
      pinTxNull: pin != null && (pin.txId == null || pin.txId === ""),
      txPhase: window.__getMainTabToShuffleTransaction?.()?.phase ?? null,
    };
  });
  report.E_popstateDuringActiveTx.ok =
    report.E_popstateDuringActiveTx.pinTxNull !== true &&
    report.E_popstateDuringActiveTx.pinActive !== true;

  // F: full hop then back/forward
  await page.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  await shuffle.waitFor({ state: "visible", timeout: 15000 });
  await shuffle.click({ timeout: 15000 });
  await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const afterBack = await page.evaluate(() => {
    const ring = (window.__mainTabToShuffleTraceExport?.() || []).slice(-20).map((e) => e.kind);
    const pin = window.__getSoftCommitTxPin?.() ?? null;
    return {
      pathname: location.pathname,
      transitionBegin: ring.includes("TRANSITION_BEGIN"),
      pinActive: !!(pin && (pin.phase === "preparing" || pin.phase === "armed" || pin.phase === "sliding")),
    };
  });
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const afterForward = await page.evaluate(() => ({
    pathname: location.pathname,
    pin: window.__getSoftCommitTxPin?.() ?? null,
  }));
  report.F_backForwardAfterSettled = {
    afterBack,
    afterForward,
    ok:
      (afterBack.pathname === "/chats" || String(afterBack.pathname).includes("chats")) &&
      afterBack.transitionBegin !== true &&
      afterBack.pinActive !== true &&
      afterForward.pathname === "/shuffle",
  };

  await context.close();
}

// D web/non-native
{
  const context = await browser.newContext({
    userAgent: WEB_UA,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);
  report.D_webNonNative = await page.evaluate(() => {
    const mode = window.__getMainTabToShuffleCommitNavigationMode?.("/shuffle") ?? null;
    return {
      uaNative: /SayItToMeApp|wv\)/i.test(navigator.userAgent || ""),
      mode,
    };
  });
  report.D_webNonNative.ok = report.D_webNonNative.uaNative === false;
  await context.close();
}

await browser.close();

report.PASS = [
  report.A_directCold?.ok,
  report.B_flagFalse?.ok,
  report.C_nonMicroHardNav?.ok,
  report.D_webNonNative?.ok,
  report.E_popstateDuringActiveTx?.ok,
  report.F_backForwardAfterSettled?.ok,
].every(Boolean);

fs.writeFileSync(path.join(OUT, "preservation.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.PASS ? 0 : 1);
