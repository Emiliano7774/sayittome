/**
 * Single-tap native-shell soft-nav diag verification.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/1.0 wv";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "1");
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });

const btn = page.locator('.sayittome-bottom-nav [data-nav-tab="shuffle"]').first();
await btn.waitFor({ state: "visible", timeout: 20000 });
await btn.tap({ timeout: 15000 });
await page.waitForTimeout(2500);

const snap = await page.evaluate(() => {
  let soft = Array.isArray(window.__microSlideCommitNavDiag)
    ? window.__microSlideCommitNavDiag
    : [];
  if (!soft.length) {
    try {
      soft = JSON.parse(sessionStorage.getItem("sayittome:micro-slide-commit-nav-diag") || "[]");
    } catch {
      soft = [];
    }
  }
  return {
    pathname: location.pathname,
    uaNative: /SayItToMeApp|wv\)/i.test(navigator.userAgent || ""),
    mode:
      typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
        ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
        : null,
    soft: soft.map((e) => ({
      kind: e.kind,
      forcedSoft: e.forcedSoft,
      isNativeAppShell: e.isNativeAppShell,
      shouldHardNavigate: e.shouldHardNavigate,
      caller: e.caller,
      phase: e.phase,
    })),
    slide: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
    datasetOwner: document.documentElement.getAttribute("data-main-tab-shuffle-owner"),
  };
});

const kinds = new Set(snap.soft.map((e) => e.kind));
const report = {
  pathname: snap.pathname,
  uaNative: snap.uaNative,
  mode: snap.mode,
  softEventCount: snap.soft.length,
  softKinds: [...kinds],
  soft: snap.soft,
  HARD_NAVIGATION_BYPASSED: kinds.has("MICRO_SLIDE_HARD_NAVIGATION_BYPASSED"),
  SOFT_ROUTER_PUSH_CALLED: kinds.has("MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED"),
  SOFT_NAVIGATION_REQUIRED: kinds.has("MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED"),
  SAME_DOCUMENT: snap.pathname === "/shuffle",
  PASS:
    snap.pathname === "/shuffle" &&
    snap.uaNative === true &&
    snap.mode?.effectiveCommitNavigationMode === "soft" &&
    kinds.has("MICRO_SLIDE_HARD_NAVIGATION_BYPASSED") &&
    kinds.has("MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED"),
};

const out = path.join(
  __dirname,
  "ghost-filmstrip-out",
  "local-native-shell-soft-nav-fix-plan",
  "soft-nav-diag-probe.json",
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.PASS ? 0 : 1);
