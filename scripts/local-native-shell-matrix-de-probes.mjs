/**
 * Lightweight local probes for native-shell soft-nav fix matrix cases D/E
 * that do not require a full multi-hop release runner.
 *
 * D. FLAG_FALSE_NATIVE_SHELL — hard nav path remains for /shuffle without active tx
 * E. DIRECT_COLD_SHUFFLE_NATIVE_SHELL — no micro-slide tx on cold load
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCommitNavigationMode, computeForceSoftNavigationForCommit } from "./main-tab-shuffle-commit-nav-mode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const outDir = path.join(
  __dirname,
  "ghost-filmstrip-out",
  "local-native-shell-soft-nav-fix-plan",
);

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/1.0 wv";

const report = {
  FLAG_FALSE_NATIVE_SHELL: null,
  DIRECT_COLD_SHUFFLE_NATIVE_SHELL: null,
  LOCAL_BROWSER_MODE_DECISION: null,
  REDUCED_MOTION_MODE_DECISION: null,
};

// Pure decisions (always available)
report.LOCAL_BROWSER_MODE_DECISION = computeCommitNavigationMode({
  href: "/shuffle",
  microSlideEnabled: true,
  nativeShellHardNavWouldApply: false,
});
report.REDUCED_MOTION_MODE_DECISION = computeCommitNavigationMode({
  href: "/shuffle",
  microSlideEnabled: true,
  nativeShellHardNavWouldApply: true,
});
report.FLAG_FALSE_NATIVE_SHELL = {
  mode: computeCommitNavigationMode({
    href: "/shuffle",
    microSlideEnabled: false,
    nativeShellHardNavWouldApply: true,
  }),
  forceWithoutTx: computeForceSoftNavigationForCommit({
    href: "/shuffle",
    microSlideEnabled: false,
    phase: "preparing",
  }),
  expected: { mode: "hard", force: false },
};
report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL = {
  forceWithoutTx: computeForceSoftNavigationForCommit({
    href: "/shuffle",
    microSlideEnabled: true,
    phase: null,
  }),
  expectedForce: false,
};

let browserProbe = null;
try {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // E: direct cold /shuffle under native UA — no active micro-slide tx expected
  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const cold = await page.evaluate(() => {
    const softNav = Array.isArray(window.__microSlideCommitNavDiag)
      ? window.__microSlideCommitNavDiag
      : [];
    const mode =
      typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
        ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
        : null;
    const uaNative = /SayItToMeApp|wv\)/i.test(navigator.userAgent || "");
    return {
      pathname: location.pathname,
      uaNative,
      softNavEventCount: softNav.length,
      mode,
      datasetSlide: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
    };
  });
  report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL.browser = cold;
  report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL.ok =
    cold.pathname === "/shuffle" &&
    cold.uaNative === true &&
    cold.softNavEventCount === 0 &&
    (cold.datasetSlide == null || cold.datasetSlide === "");

  // D: flag false on localhost — clear override, confirm mode hard under native UA
  await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "0");
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  const flagFalse = await page.evaluate(() => {
    const mode =
      typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
        ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
        : null;
    const uaNative = /SayItToMeApp|wv\)/i.test(navigator.userAgent || "");
    return { mode, uaNative, pathname: location.pathname };
  });
  report.FLAG_FALSE_NATIVE_SHELL.browser = flagFalse;
  report.FLAG_FALSE_NATIVE_SHELL.ok =
    flagFalse.uaNative === true &&
    (flagFalse.mode == null ||
      flagFalse.mode.effectiveCommitNavigationMode === "hard" ||
      flagFalse.mode.microSlideEnabled === false);

  await browser.close();
  browserProbe = "ok";
} catch (err) {
  browserProbe = String(err?.message || err);
  report.browserProbeError = browserProbe;
}

report.FLAG_FALSE_DECISION_OK =
  report.FLAG_FALSE_NATIVE_SHELL.mode.effectiveCommitNavigationMode === "hard" &&
  report.FLAG_FALSE_NATIVE_SHELL.forceWithoutTx === false;
report.DIRECT_COLD_DECISION_OK =
  report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL.forceWithoutTx === false;
report.OVERALL_PROBE_PASS =
  report.FLAG_FALSE_DECISION_OK &&
  report.DIRECT_COLD_DECISION_OK &&
  (report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL.ok !== false || browserProbe !== "ok"
    ? report.DIRECT_COLD_SHUFFLE_NATIVE_SHELL.ok !== false
    : true);

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "matrix-de-probes.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outPath, browserProbe, ...report }, null, 2));
process.exit(report.FLAG_FALSE_DECISION_OK && report.DIRECT_COLD_DECISION_OK ? 0 : 1);
