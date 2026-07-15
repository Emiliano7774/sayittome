/**
 * Controlled Boost prepaint remount race gate — forces session marker + hard remount
 * and samples BoostAccessGate loading visibility immediately after navigation.
 * Usage: node scripts/prepaint-boost-remount-race-gate.mjs --base http://127.0.0.1:3010 --repeat 20
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const repeat = Math.max(
  1,
  Number(args[args.indexOf("--repeat") + 1] || 20) || 20,
);

const browser = await chromium
  .launch({ headless: true, channel: "chrome" })
  .catch(() => chromium.launch({ headless: true }));

const results = [];
for (let i = 0; i < repeat; i++) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
      localStorage.setItem("sayittome:nav-capture", "1");
      sessionStorage.setItem("sayittome:nav-capture-session", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  await page.goto(`${base}/shuffle?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(500);
  const pre = await page.evaluate(() => {
    const until = Date.now() + 3000;
    const marker = {
      destination: "/boost",
      from: "/shuffle",
      txId: `boost-race-${Date.now()}`,
      startedAt: Date.now(),
      expiresAt: until,
    };
    sessionStorage.setItem("sayittome:boost-prepaint-handoff", JSON.stringify(marker));
    sessionStorage.setItem(
      "sayittome:boost-sequence-handoff-suppress-until",
      String(until),
    );
    document.documentElement.dataset.prepaintBoostHandoffSuppress = "1";
    document.documentElement.dataset.boostHandoffSuppress = "1";
    document.documentElement.dataset.boostPostCommitSettle = "1";
    return {
      markerWritten: true,
      exportPresent: typeof window.__microSlideActivationExport === "function",
    };
  });
  await page.goto(`${base}/boost?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "commit",
    timeout: 90_000,
  });
  const early = await page.evaluate(() => {
    const LOADING_RE = /Cargando\.\.\.|Loading\.\.\./i;
    const nodes = [
      ...document.querySelectorAll(
        '[data-nav-loading-copy], [data-boost-access-state="loading"]',
      ),
    ];
    const visibleLoading = nodes.some((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        LOADING_RE.test(el.textContent || "") &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) >= 0.04 &&
        r.width > 2 &&
        r.height > 2
      );
    });
    return {
      pathname: location.pathname,
      visibleLoading,
      prepaint:
        document.documentElement.getAttribute(
          "data-prepaint-boost-handoff-suppress",
        ) === "1",
      suppress:
        document.documentElement.getAttribute("data-boost-handoff-suppress") ===
        "1",
      exportPresent: typeof window.__microSlideActivationExport === "function",
      markerPresent: !!sessionStorage.getItem("sayittome:boost-prepaint-handoff"),
    };
  });
  await page.waitForTimeout(900);
  const late = await page.evaluate(() => ({
    exportPresent: typeof window.__microSlideActivationExport === "function",
    pathname: location.pathname,
  }));
  const pass =
    early.visibleLoading === false &&
    (early.prepaint || early.suppress || early.markerPresent) &&
    early.pathname.startsWith("/boost");
  results.push({
    i,
    pass,
    pre,
    early,
    late,
    remountExportPendingSuppressed:
      early.exportPresent === false && early.visibleLoading === false,
  });
  await context.close();
}

await browser.close();
const passCount = results.filter((r) => r.pass).length;
const out = {
  gate: "BOOST_PREPAINT_REMOUNT_RACE_GATE",
  pass: passCount === results.length,
  passCount,
  total: results.length,
  results,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
