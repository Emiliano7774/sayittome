/**
 * Bidirectional tab no-loading local probe (8 directions).
 * Usage:
 *   node scripts/bidirectional-tab-no-loading-local-probe.mjs --base http://127.0.0.1:3010 --out <dir>
 *   node scripts/bidirectional-tab-no-loading-local-probe.mjs --base http://127.0.0.1:3010 --out <dir> --logged-in
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  evaluateBidirectionalSeries,
  evaluateBidirectionalTabNoLoadingVisualGate,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";
import {
  classifyBidirectionalHopOutcome,
  safeEvaluate,
  safeSample,
  waitForDestinationPath,
} from "./bidirectional-context-rebind.mjs";

const args = process.argv.slice(2);
function argValue(name) {
  const exact = args.indexOf(name);
  if (exact >= 0) return args[exact + 1] ?? null;
  const prefix = `${name}=`;
  const withEq = args.find((a) => a.startsWith(prefix));
  return withEq ? withEq.slice(prefix.length) : null;
}

const base = argValue("--base") || "http://127.0.0.1:3010";
let out =
  argValue("--out") ||
  path.join("scripts", "ghost-filmstrip-out", `bidirectional-probe-${Date.now()}`);
// Allow --out pointing at a summary filename; treat parent as artifact dir.
if (out.endsWith(".json")) out = path.dirname(out);
const mode = argValue("--mode");
const loggedIn =
  args.includes("--logged-in") || mode === "logged-in" || mode === "loggedin";
const profile = loggedIn
  ? path.resolve("scripts/.auth-capture-profile-chrome-diag")
  : null;
const outTag = loggedIn ? "logged-in" : "fresh-anon";
const film = path.join(out, `${outTag}-8dir-filmstrip`);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(film, { recursive: true });

const onlyRaw = argValue("--only");
const repeat = Math.max(1, Number(argValue("--repeat") || "1") || 1);
const injectContextDestroyed = args.includes("--inject-context-destroyed");
const stressShuffleToChats = args.includes("--stress-shuffle-to-chats");

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";
const PROVIDER = "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST";

const directionsBase = [
  { source: "chats", dest: "shuffle" },
  { source: "settings", dest: "shuffle" },
  { source: "stories", dest: "shuffle" },
  { source: "boost", dest: "shuffle" },
  { source: "shuffle", dest: "chats" },
  { source: "shuffle", dest: "settings" },
  { source: "shuffle", dest: "stories" },
  { source: "shuffle", dest: "boost" },
];

function parseOnly(raw) {
  if (!raw) return null;
  return raw.split(",").map((pair) => {
    const [source, dest] = pair.trim().split(/[:->]+/);
    return { source, dest };
  });
}

const directionsFiltered = (() => {
  if (stressShuffleToChats) return [{ source: "shuffle", dest: "chats" }];
  const only = parseOnly(onlyRaw);
  if (!only?.length) return directionsBase;
  return only;
})();

const directions = [];
for (let i = 0; i < repeat; i += 1) {
  for (const d of directionsFiltered) {
    directions.push({ ...d, repeatIndex: i });
  }
}

async function sample(page) {
  return page.evaluate(() => {
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    function visibleLoadingIn(root) {
      if (!root) return { text: false, shell: 0 };
      const shells = [...root.querySelectorAll("[data-loading-shell]")].filter((el) => {
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
      let text = false;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
              text = true;
              break;
            }
          }
        }
        n = walker.nextNode();
      }
      return { text, shell: shells.length };
    }

    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const shufflePrep =
      shuffleHost?.querySelector(".sayittome-shuffle-surface-prep") || shuffleHost;
    const main = document.querySelector("main") || document.body;
    const shuffleVis = visibleLoadingIn(shufflePrep);
    const mainVis = visibleLoadingIn(main);
    const bodyVis = visibleLoadingIn(document.body);
    // Ignore loading chrome that only exists inside frozen keepalives.
    let loadingTextAnywhere = bodyVis.text;
    let loadingShellAnywhere = bodyVis.shell;
    if (loadingTextAnywhere || loadingShellAnywhere > 0) {
      const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
      let exposedText = false;
      let exposedShell = 0;
      for (const shell of document.querySelectorAll("[data-loading-shell]")) {
        if (shell.closest(".sayittome-main-tab-keepalive-frozen, .sayittome-shuffle-keepalive-frozen")) {
          continue;
        }
        const cs = getComputedStyle(shell);
        const r = shell.getBoundingClientRect();
        if (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          parseFloat(cs.opacity) >= 0.04 &&
          r.width > 1 &&
          r.height > 1
        ) {
          exposedShell += 1;
        }
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n = walker.nextNode();
      while (n) {
        const t = n.textContent?.trim() || "";
        if (LOADING_RE.test(t)) {
          const el = n.parentElement;
          if (
            el &&
            !el.closest(".sayittome-main-tab-keepalive-frozen, .sayittome-shuffle-keepalive-frozen")
          ) {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (
              cs.display !== "none" &&
              cs.visibility !== "hidden" &&
              parseFloat(cs.opacity) >= 0.04 &&
              r.width > 1 &&
              r.height > 1
            ) {
              exposedText = true;
              break;
            }
          }
        }
        n = walker.nextNode();
      }
      loadingTextAnywhere = exposedText;
      loadingShellAnywhere = exposedShell;
    }
    const list = shufflePrep?.querySelector("[data-shuffle-list]");
    const slots = list
      ? [...list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")].length
      : 0;
    const act = window.__microSlideActivationExport?.() ?? null;
    const tabReady =
      typeof window.__sayittomeGetTabDestinationVisualReadiness === "function"
        ? window.__sayittomeGetTabDestinationVisualReadiness(location.pathname)
        : null;
    const blackRoot =
      document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "black";
    const presentedNone =
      document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "none";

    return {
      pathname: location.pathname,
      loadingTextAnywhere,
      loadingShellAnywhere,
      shuffleLoadingText: shuffleVis.text,
      shuffleLoadingShell: shuffleVis.shell,
      mainLoadingText: mainVis.text,
      mainLoadingShell: mainVis.shell,
      slots,
      flag: act?.microSlideRuntimeEnabled === true,
      tabReady,
      blackRoot,
      presentedNone,
      exitHandoff: document.documentElement.classList.contains(
        "sayittome-shuffle-exit-handoff-pending",
      ),
      mainHandoff: document.documentElement.classList.contains(
        "sayittome-main-tab-handoff-pending",
      ),
    };
  });
}

async function runDirection(page, { source, dest }, opts = {}) {
  const samples = [];
  await page.goto(`${base}/${source}?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await safeEvaluate(page, () => {
    try {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    } catch {
      /* ignore */
    }
    return true;
  });
  await page.waitForTimeout(1500);

  // Dismiss common blocking prompts (notification permission banner).
  for (let i = 0; i < 3; i++) {
    try {
      const dismiss = page.getByRole("button", { name: /Ahora no|Not now/i }).first();
      if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) {
        await dismiss.click({ timeout: 2000, force: true }).catch(() => {});
        await page.waitForTimeout(250);
      } else break;
    } catch {
      break;
    }
  }

  // Ensure bottom nav is present before probing dest tab.
  try {
    await page.locator("[data-nav-tab]").first().waitFor({ state: "attached", timeout: 20_000 });
  } catch {
    return {
      source,
      dest,
      classification: "SKIPPED_SOURCE_UNAVAILABLE",
      skippedSourceUnavailable: true,
      visualProvider: PROVIDER,
      error: "bottom-nav-missing",
    };
  }

  if (source !== "shuffle" && dest === "shuffle") {
    await safeEvaluate(page, () => {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.includes("shuffle:pool") || k.includes("shuffle:stats")) localStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
      return true;
    });
  }

  const tab = page.locator(`[data-nav-tab="${dest}"]`).first();
  try {
    await tab.waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    return {
      source,
      dest,
      classification: "SKIPPED_SOURCE_UNAVAILABLE",
      skippedSourceUnavailable: true,
      visualProvider: PROVIDER,
      error: "dest-tab-not-attached",
    };
  }

  const visible = await tab.isVisible().catch(() => false);
  let contextDestroyedHandled = false;
  let pageClosed = false;
  const navEvents = [];
  let realInputCount = 0;
  const iv = setInterval(async () => {
    try {
      const r = await safeSample(page, sample);
      if (r.contextDestroyedHandled) contextDestroyedHandled = true;
      if (r.ok && r.sample) samples.push({ t: Date.now(), ...r.sample });
    } catch {
      /* ignore */
    }
  }, 40);

  try {
    await tab.dispatchEvent("pointerdown");
    await page.waitForTimeout(20);
    // Bottom nav can be covered by permission banners; always force for reliability.
    await tab.click({ timeout: 10_000, force: true });
    realInputCount = 1;
    opts.armContextDestroyInject?.();
  } catch (e) {
    // Fallback: DOM programmatic click (still one input attempt)
    try {
      const clickEval = await safeEvaluate(
        page,
        (destTab) => {
          const el = document.querySelector(`[data-nav-tab="${destTab}"]`);
          if (!el) throw new Error("missing-tab");
          el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          el.click();
          return true;
        },
        dest,
      );
      if (clickEval.contextDestroyedHandled) contextDestroyedHandled = true;
      if (!clickEval.ok) {
        clearInterval(iv);
        return {
          source,
          dest,
          classification: "SKIPPED_SOURCE_UNAVAILABLE",
          skippedSourceUnavailable: true,
          visualProvider: PROVIDER,
          error: `${String(e)} | fallback:${clickEval.error}`,
          tabVisible: visible,
          realInputCount: 0,
        };
      }
      realInputCount = 1;
      opts.armContextDestroyInject?.();
    } catch (e2) {
      clearInterval(iv);
      return {
        source,
        dest,
        classification: "SKIPPED_SOURCE_UNAVAILABLE",
        skippedSourceUnavailable: true,
        visualProvider: PROVIDER,
        error: `${String(e)} | fallback:${String(e2)}`,
        tabVisible: visible,
        realInputCount: 0,
      };
    }
  }

  // Wait for destination route — DOM/read retries only; NEVER a second tap.
  const routeWait = await waitForDestinationPath(page, dest, { deadlineMs: 8000 });
  if (routeWait.contextDestroyedHandled) contextDestroyedHandled = true;
  if (routeWait.pageClosed) pageClosed = true;
  navEvents.push(...(routeWait.navEvents || []));
  navEvents.push({
    t: Date.now(),
    event: "ROUTE_WAIT_DONE",
    reached: routeWait.reached,
    pathname: routeWait.pathname,
    FRAME_REBOUND_AFTER_NAVIGATION: routeWait.FRAME_REBOUND_AFTER_NAVIGATION === true,
  });

  await page.waitForTimeout(800);
  // Wait until handoff freeze clears (canonical idle) up to ~8s.
  const idleDeadline = Date.now() + 8000;
  while (Date.now() < idleDeadline) {
    const r = await safeSample(page, sample);
    if (r.contextDestroyedHandled) contextDestroyedHandled = true;
    if (r.classificationHint === "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED") {
      pageClosed = true;
      break;
    }
    if (r.ok && r.sample) {
      samples.push({ t: Date.now(), ...r.sample });
      if (!r.sample.exitHandoff && !r.sample.mainHandoff) break;
    }
    await page.waitForTimeout(100);
  }
  clearInterval(iv);

  const finalSafe = await safeSample(page, sample);
  if (finalSafe.contextDestroyedHandled) contextDestroyedHandled = true;
  if (finalSafe.classificationHint === "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED") pageClosed = true;
  const final = finalSafe.ok
    ? finalSafe.sample
    : {
        pathname: routeWait.pathname,
        loadingTextAnywhere: false,
        loadingShellAnywhere: 0,
        exitHandoff: false,
        mainHandoff: false,
        flag: false,
        blackRoot: false,
        presentedNone: false,
      };
  if (finalSafe.ok) samples.push({ t: Date.now(), final: true, ...final });

  const shot = path.join(film, `${source}-to-${dest}.png`);
  try {
    if (!page.isClosed?.()) await page.screenshot({ path: shot, fullPage: false });
  } catch {
    /* preserve hop even if screenshot fails after nav */
  }

  const during = samples.filter((s) => !s.final);
  const anyText = during.some((s) => s.loadingTextAnywhere) || false;
  const anyShell = during.some((s) => s.loadingShellAnywhere > 0) || false;
  const blackRootCount = during.filter((s) => s.blackRoot).length;
  const presentedNoneCount = during.filter((s) => s.presentedNone).length;
  const midLoadingWhileFrozen = during.filter(
    (s) =>
      (s.loadingTextAnywhere || s.loadingShellAnywhere > 0) &&
      (s.exitHandoff || s.mainHandoff),
  );
  const midLoadingAfterReveal = during.filter(
    (s) =>
      (s.loadingTextAnywhere || s.loadingShellAnywhere > 0) &&
      !s.exitHandoff &&
      !s.mainHandoff &&
      s.pathname === `/${dest}`,
  );

  const reachedDest =
    final.pathname === `/${dest}` || routeWait.reached === true;
  const postHopCanonicalIdle = !(final.exitHandoff || final.mainHandoff);

  let classification = classifyBidirectionalHopOutcome({
    reachedDest,
    anyLoadingText: anyText,
    anyShell,
    pageClosed,
    contextDestroyedHandled,
    sampleCount: samples.length,
    unexpectedHardNav: false,
    postHopCanonicalIdle,
  });

  // Preserve legacy loading layer labels when loading was visible.
  if (anyText || anyShell) {
    const destLoading = during.some((s) => {
      if (dest === "shuffle") return s.shuffleLoadingText || s.shuffleLoadingShell > 0;
      return s.mainLoadingText || s.mainLoadingShell > 0;
    });
    const sourceLoading = during.some((s) => {
      if (source === "shuffle") return s.shuffleLoadingText || s.shuffleLoadingShell > 0;
      return s.pathname === `/${source}` && (s.mainLoadingText || s.mainLoadingShell > 0);
    });
    if (destLoading && sourceLoading) classification = "BOTH_LOADING_VISIBLE";
    else if (destLoading) classification = "DESTINATION_LOADING_VISIBLE";
    else if (sourceLoading) classification = "SOURCE_LOADING_VISIBLE";
    else classification = "DESTINATION_LOADING_VISIBLE";
  }

  const clean =
    classification === "CLEAN" ||
    classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND";

  const hop = {
    source,
    dest,
    classification,
    clean,
    anyLoadingText: anyText,
    anyLoadingShell: anyShell,
    visibleLoadingTextCount: anyText ? 1 : 0,
    loadingShellCount: anyShell ? 1 : 0,
    blackRootCount,
    presentedNoneCount,
    reachedDest,
    postHopCanonicalIdle,
    visualProvider: PROVIDER,
    noScreencastUsed: false,
    realInputCount,
    flagEnabled: final.flag === true,
    final,
    midLoadingWhileFrozenCount: midLoadingWhileFrozen.length,
    midLoadingAfterRevealCount: midLoadingAfterReveal.length,
    midLoadingTail: during
      .filter((s) => s.loadingTextAnywhere || s.loadingShellAnywhere > 0)
      .slice(0, 8),
    sampleCount: samples.length,
    screenshot: shot,
    tabVisible: visible,
    CONTEXT_DESTROYED_DURING_NAVIGATION_HANDLED: contextDestroyedHandled,
    FRAME_REBOUND_AFTER_NAVIGATION: contextDestroyedHandled,
    DOM_SAMPLE_RETRY_AFTER_CONTEXT_REBIND: contextDestroyedHandled,
    VISUAL_FRAMES_PRESERVED_ACROSS_CONTEXT_REBIND: samples.length > 0,
    navEvents,
    pageClosed,
  };
  hop.gate = evaluateBidirectionalTabNoLoadingVisualGate(hop);
  return hop;
}

const launchOpts = {
  headless: true,
  channel: "chrome",
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

let browserOrCtx;
let context;
if (profile) {
  browserOrCtx = await chromium.launchPersistentContext(profile, launchOpts);
  context = browserOrCtx;
} else {
  try {
    browserOrCtx = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    browserOrCtx = await chromium.launch({ headless: true });
  }
  context = await browserOrCtx.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
}

await context.addInitScript(() => {
  try {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
  } catch {
    /* ignore */
  }
});

const page = context.pages?.()[0] || (await context.newPage());

let pendingContextDestroyInjects = 0;
if (injectContextDestroyed) {
  const origEvaluate = page.evaluate.bind(page);
  page.evaluate = async (...evalArgs) => {
    if (pendingContextDestroyInjects > 0) {
      pendingContextDestroyInjects -= 1;
      throw new Error(
        "Execution context was destroyed, most likely because of a navigation",
      );
    }
    return origEvaluate(...evalArgs);
  };
}

const results = [];
for (const d of directions) {
  console.log(`DIR ${d.source}->${d.dest}${d.repeatIndex != null ? ` #${d.repeatIndex}` : ""}`);
  results.push(
    await runDirection(page, d, {
      armContextDestroyInject: () => {
        if (injectContextDestroyed) pendingContextDestroyInjects = 1;
      },
    }),
  );
}

if (profile) await context.close();
else {
  await context.close();
  await browserOrCtx.close();
}

const series = evaluateBidirectionalSeries(results);
const hardPass =
  results.every(
    (r) =>
      r.classification === "CLEAN" ||
      r.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
  ) && series.noScreencastBlocked !== true;
const summary = {
  outTag,
  base,
  flagMode: "localhost localStorage MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE=true",
  visualProvider: PROVIDER,
  classifications: Object.fromEntries(results.map((r) => [`${r.source}->${r.dest}`, r.classification])),
  cleanCount: results.filter((r) => r.classification === "CLEAN").length,
  skippedCount: results.filter((r) => r.classification === "SKIPPED_SOURCE_UNAVAILABLE").length,
  loadingFailCount: results.filter((r) => String(r.classification).includes("LOADING")).length,
  hardPass,
  series,
  directions: results,
};

fs.writeFileSync(path.join(out, `${outTag}-8dir-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ classifications: summary.classifications, hardPass, seriesPass: series.pass }, null, 2));
process.exit(hardPass ? 0 : 2);
