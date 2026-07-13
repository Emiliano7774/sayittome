/**
 * Fresh-anon no-loading mid-slide local probe (Playwright).
 * Usage: node scripts/no-loading-fresh-anon-local-probe.mjs --base http://localhost:3010 --out <dir> [--baseline]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const out = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `no-loading-fresh-anon-probe-${Date.now()}`);
const baseline = process.argv.includes("--baseline");
const sourceTab = process.argv.includes("--source")
  ? process.argv[process.argv.indexOf("--source") + 1]
  : "chats";

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, "filmstrip"), { recursive: true });

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

async function sampleDestination(page) {
  return page.evaluate(() => {
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    const prep = host?.querySelector(".sayittome-shuffle-surface-prep") || host;
    const shells = [...(prep?.querySelectorAll("[data-loading-shell]") || [])].filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) >= 0.04 &&
        r.width > 1 &&
        r.height > 1
      );
    });
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    let loadingTextVisible = false;
    if (prep) {
      const walker = document.createTreeWalker(prep, NodeFilter.SHOW_TEXT);
      let n = walker.nextNode();
      while (n) {
        const t = n.textContent?.trim() || "";
        if (LOADING_RE.test(t)) {
          const el = n.parentElement;
          if (el) {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (
              cs.display !== "none" &&
              cs.visibility !== "hidden" &&
              parseFloat(cs.opacity) >= 0.04 &&
              r.width > 1 &&
              r.height > 1
            ) {
              loadingTextVisible = true;
              break;
            }
          }
        }
        n = walker.nextNode();
      }
    }
    const list = prep?.querySelector("[data-shuffle-list]");
    const slots = list
      ? [...list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")].length
      : 0;
    const visual =
      typeof window.__sayittomeGetShuffleDestinationVisualReadiness === "function"
        ? window.__sayittomeGetShuffleDestinationVisualReadiness()
        : null;
    const tx = window.__mainTabToShuffleTxExport?.() ?? null;
    const act = window.__microSlideActivationExport?.() ?? null;
    return {
      pathname: location.pathname,
      loadingShellVisible: shells.length > 0,
      loadingShellCount: shells.length,
      loadingTextVisible,
      hasShuffleList: Boolean(list),
      slots,
      slideState: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
      visual,
      txPhase: tx?.phase ?? null,
      microSlideEnabled: act?.microSlideRuntimeEnabled === true,
      poolWarm: window.__microSlideNoLoadingDiag ?? null,
    };
  });
}

async function runOne(source) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const samples = [];

  await page.addInitScript(() => {
    try {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    } catch {}
  });

  const startPath = `/${source}`;
  await page.goto(`${base}${startPath}?navcapture=1&_fa=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(1500);

  // Clear shuffle cache to force fresh-anon cold destination.
  await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.includes("shuffle:pool") || k.includes("shuffle:stats")) localStorage.removeItem(k);
      }
      sessionStorage.removeItem("sayittome:shuffle:hydrated:v1");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const shuffleTab = page.locator('[data-nav-tab="shuffle"]').first();
  await shuffleTab.waitFor({ state: "visible", timeout: 30_000 });

  const sampling = setInterval(async () => {
    try {
      samples.push({ t: Date.now(), ...(await sampleDestination(page)) });
    } catch {
      /* ignore */
    }
  }, 50);

  await shuffleTab.dispatchEvent("pointerdown");
  await page.waitForTimeout(30);
  await shuffleTab.click({ timeout: 15_000 });

  // Wait for either /shuffle settle or timeout staying on source (contract cancel).
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const pathNow = new URL(page.url()).pathname;
    const snap = await sampleDestination(page);
    samples.push({ t: Date.now(), ...snap });
    if (pathNow === "/shuffle" && snap.slideState !== "running" && snap.txPhase !== "preparing") {
      break;
    }
    if (
      pathNow !== "/shuffle" &&
      (snap.txPhase === "aborted" || snap.txPhase === null) &&
      Date.now() > deadline - 2000
    ) {
      break;
    }
    await page.waitForTimeout(100);
  }

  clearInterval(sampling);
  await page.waitForTimeout(400);
  const final = await sampleDestination(page);
  samples.push({ t: Date.now(), final: true, ...final });

  const shot = path.join(out, "filmstrip", `${source}-final.png`);
  await page.screenshot({ path: shot, fullPage: false });

  await browser.close();

  const mid = samples.filter((s) => s.slideState === "running" || s.txPhase === "sliding");
  const anyLoadingShell = samples.some((s) => s.loadingShellVisible);
  const anyLoadingText = samples.some((s) => s.loadingTextVisible);
  const midLoading =
    mid.some((s) => s.loadingShellVisible || s.loadingTextVisible) ||
    samples.some(
      (s) =>
        (s.txPhase === "preparing" || s.txPhase === "armed" || s.txPhase === "sliding") &&
        (s.loadingShellVisible || s.loadingTextVisible) &&
        s.pathname === "/shuffle",
    );

  const reachedShuffle = final.pathname === "/shuffle";
  const clean =
    !midLoading &&
    !(reachedShuffle && (final.loadingShellVisible || final.loadingTextVisible)) &&
    (reachedShuffle ? final.slots >= 3 : true);

  return {
    source,
    clean,
    baselineMode: baseline,
    reachedShuffle,
    final,
    anyLoadingShell,
    anyLoadingText,
    midLoading,
    midSampleCount: mid.length,
    sampleCount: samples.length,
    samples: samples.slice(-40),
    screenshot: shot,
  };
}

const result = await runOne(sourceTab);
const name = baseline ? "baseline-fresh-anon-visual.json" : "fresh-anon-fixed-visual-summary.json";
fs.writeFileSync(path.join(out, name), JSON.stringify(result, null, 2));
fs.writeFileSync(
  path.join(out, baseline ? "baseline-dom-loading-state.json" : "fresh-anon-dom-loading-state.json"),
  JSON.stringify(
    {
      loadingShell: result.final.loadingShellVisible,
      loadingText: result.final.loadingTextVisible,
      slots: result.final.slots,
      midLoading: result.midLoading,
      anyLoadingShell: result.anyLoadingShell,
      anyLoadingText: result.anyLoadingText,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ clean: result.clean, ...result.final, midLoading: result.midLoading }, null, 2));
process.exit(baseline ? 0 : result.clean ? 0 : 2);
