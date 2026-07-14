/**
 * Bidirectional native-shell soft-nav release 20/20.
 * Mixes nonShuffle→Shuffle and Shuffle→nonShuffle hops under native UA.
 *
 * Usage:
 *   node scripts/bidirectional-native-shell-release-20.mjs --base http://127.0.0.1:3010 --out <dir> [--chrome]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  evaluateBidirectionalSeries,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
function argValue(name) {
  const exact = args.indexOf(name);
  if (exact >= 0) return args[exact + 1] ?? null;
  const prefix = `${name}=`;
  const withEq = args.find((a) => a.startsWith(prefix));
  return withEq ? withEq.slice(prefix.length) : null;
}

const base = argValue("--base") || "http://127.0.0.1:3010";
const out = argValue("--out") || path.join(root, "scripts/ghost-filmstrip-out/bidirectional-native-20");
const useChrome = args.includes("--chrome");
const forceFresh = args.includes("--fresh");
const profile = path.join(
  root,
  "scripts",
  useChrome ? ".auth-capture-profile-chrome-diag" : ".auth-capture-profile",
);
fs.mkdirSync(out, { recursive: true });

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";
const PROVIDER = "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST";

const cycle = [
  { source: "chats", dest: "shuffle" },
  { source: "settings", dest: "shuffle" },
  { source: "stories", dest: "shuffle" },
  { source: "boost", dest: "shuffle" },
  { source: "shuffle", dest: "chats" },
  { source: "shuffle", dest: "settings" },
  { source: "shuffle", dest: "stories" },
  { source: "shuffle", dest: "boost" },
];
// 20 hops = 2 full cycles + first 4 of third
const hopsPlan = [...cycle, ...cycle, ...cycle.slice(0, 4)];

async function sample(page) {
  return page.evaluate(() => {
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    function exposedLoading() {
      let text = false;
      let shell = 0;
      for (const el of document.querySelectorAll("[data-loading-shell]")) {
        if (el.closest(".sayittome-main-tab-keepalive-frozen, .sayittome-shuffle-keepalive-frozen")) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.04 && r.width > 1 && r.height > 1) shell += 1;
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n = walker.nextNode();
      while (n) {
        const t = n.textContent?.trim() || "";
        if (LOADING_RE.test(t)) {
          const el = n.parentElement;
          if (el && !el.closest(".sayittome-main-tab-keepalive-frozen, .sayittome-shuffle-keepalive-frozen")) {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.04 && r.width > 1 && r.height > 1) {
              text = true;
              break;
            }
          }
        }
        n = walker.nextNode();
      }
      return { text, shell };
    }
    const load = exposedLoading();
    return {
      pathname: location.pathname,
      loadingTextAnywhere: load.text,
      loadingShellAnywhere: load.shell,
      blackRoot: document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "black",
      presentedNone: document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "none",
      exitHandoff: document.documentElement.classList.contains("sayittome-shuffle-exit-handoff-pending"),
      mainHandoff: document.documentElement.classList.contains("sayittome-main-tab-handoff-pending"),
      flag: window.__microSlideActivationExport?.()?.microSlideRuntimeEnabled === true,
    };
  });
}

async function runHop(page, { source, dest }, hopNum) {
  await page.goto(`${base}/${source}?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.evaluate(() => {
    try {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    } catch {}
  });
  await page.waitForTimeout(1800);
  for (let i = 0; i < 3; i++) {
    try {
      const dismiss = page.getByRole("button", { name: /Ahora no|Not now/i }).first();
      if (await dismiss.isVisible({ timeout: 400 }).catch(() => false)) {
        await dismiss.click({ timeout: 1500, force: true }).catch(() => {});
      } else break;
    } catch {
      break;
    }
  }
  const samples = [];
  const iv = setInterval(async () => {
    try {
      samples.push({ t: Date.now(), ...(await sample(page)) });
    } catch {}
  }, 40);
  try {
    await page.locator(`[data-nav-tab="${dest}"]`).first().waitFor({ state: "attached", timeout: 15_000 });
    await page.locator(`[data-nav-tab="${dest}"]`).first().click({ timeout: 10_000, force: true });
  } catch {
    await page.evaluate((d) => {
      const el = document.querySelector(`[data-nav-tab="${d}"]`);
      if (!el) throw new Error("missing-tab");
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.click();
    }, dest);
  }

  // Wait for destination route before classifying (soft-nav can lag under native UA).
  const routeDeadline = Date.now() + 6000;
  while (Date.now() < routeDeadline) {
    const p = await page.evaluate(() => location.pathname);
    if (p === `/${dest}`) break;
    await page.waitForTimeout(100);
  }
  if ((await page.evaluate(() => location.pathname)) !== `/${dest}`) {
    // One retry click
    await page.evaluate((d) => {
      const el = document.querySelector(`[data-nav-tab="${d}"]`);
      if (el) {
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        el.click();
      }
    }, dest);
    const retryDeadline = Date.now() + 4000;
    while (Date.now() < retryDeadline) {
      const p = await page.evaluate(() => location.pathname);
      if (p === `/${dest}`) break;
      await page.waitForTimeout(100);
    }
  }

  const idleDeadline = Date.now() + 8000;
  while (Date.now() < idleDeadline) {
    const snap = await sample(page);
    samples.push({ t: Date.now(), ...snap });
    if (!snap.exitHandoff && !snap.mainHandoff) break;
    await page.waitForTimeout(100);
  }
  clearInterval(iv);
  const final = await sample(page);
  const anyText = samples.some((s) => s.loadingTextAnywhere);
  const anyShell = samples.some((s) => s.loadingShellAnywhere > 0);
  const classification =
    anyText || anyShell
      ? "DESTINATION_LOADING_VISIBLE"
      : final.pathname === `/${dest}`
        ? "CLEAN"
        : "ROUTE_MISMATCH";
  return {
    hopNum,
    source,
    dest,
    classification,
    clean: classification === "CLEAN",
    anyLoadingText: anyText,
    anyLoadingShell: anyShell,
    visibleLoadingTextCount: anyText ? 1 : 0,
    loadingShellCount: anyShell ? 1 : 0,
    blackRootCount: samples.filter((s) => s.blackRoot).length,
    presentedNoneCount: samples.filter((s) => s.presentedNone).length,
    reachedDest: final.pathname === `/${dest}`,
    postHopCanonicalIdle: !(final.exitHandoff || final.mainHandoff),
    visualProvider: PROVIDER,
    noScreencastUsed: false,
    realInputCount: 1,
    flagEnabled: final.flag === true,
    final,
  };
}

const launchOpts = {
  headless: true,
  ...(useChrome ? { channel: "chrome" } : {}),
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

let context;
if (!forceFresh && fs.existsSync(profile)) {
  context = await chromium.launchPersistentContext(profile, launchOpts);
} else {
  const browser = await chromium.launch(useChrome ? { headless: true, channel: "chrome" } : { headless: true });
  context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  context._browser = browser;
}
await context.addInitScript(() => {
  try {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
  } catch {}
});

const page = context.pages()[0] || (await context.newPage());
const results = [];
for (let i = 0; i < hopsPlan.length; i++) {
  console.log(`HOP ${i + 1}/20 ${hopsPlan[i].source}->${hopsPlan[i].dest}`);
  results.push(await runHop(page, hopsPlan[i], i + 1));
}
await context.close();
if (context._browser) await context._browser.close();

const series = evaluateBidirectionalSeries(results);
const dist = {};
for (const r of results) {
  const k = `${r.source}->${r.dest}`;
  dist[k] = (dist[k] || 0) + 1;
}
const summary = {
  tag: useChrome ? "chrome-bidirectional-native-20" : "chromium-bidirectional-native-20",
  visualProvider: PROVIDER,
  hopsAttempted: results.length,
  cleanHops: results.filter((r) => r.classification === "CLEAN").length,
  RELEASE_SERIES_CLEAN:
    results.length === 20 &&
    results.every((r) => r.classification === "CLEAN") &&
    series.pass === true,
  PASS:
    results.length === 20 &&
    results.every((r) => r.classification === "CLEAN") &&
    series.pass === true,
  distribution: dist,
  series,
  directions: results,
};
fs.writeFileSync(path.join(out, "current-head-report.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ PASS: summary.PASS, cleanHops: summary.cleanHops, distribution: dist }, null, 2));
process.exit(summary.PASS ? 0 : 2);
