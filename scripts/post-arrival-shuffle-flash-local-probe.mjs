/**
 * Live post-arrival Shuffle stability probe (DOM samples after arrival).
 * Usage:
 *   node scripts/post-arrival-shuffle-flash-local-probe.mjs --base http://127.0.0.1:3010 --out <dir>
 *   node scripts/post-arrival-shuffle-flash-local-probe.mjs --base https://sayittome-app.web.app --out <dir> --prod-readonly
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  evaluatePostArrivalShuffleStabilityGate,
} from "./post-arrival-shuffle-stability-core.mjs";

const args = process.argv.slice(2);
function argValue(name) {
  const exact = args.indexOf(name);
  if (exact >= 0) return args[exact + 1] ?? null;
  const prefix = `${name}=`;
  const withEq = args.find((a) => a.startsWith(prefix));
  return withEq ? withEq.slice(prefix.length) : null;
}

const base = argValue("--base") || "http://127.0.0.1:3010";
const out =
  argValue("--out") ||
  path.join("scripts", "ghost-filmstrip-out", `post-arrival-probe-${Date.now()}`);
const repeat = Math.max(1, Number(argValue("--repeat") || "20") || 20);
const prodReadonly = args.includes("--prod-readonly");
const PROVIDER = "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST";

const hopsAll = [
  { source: "chats", dest: "shuffle" },
  { source: "stories", dest: "shuffle" },
  { source: "boost", dest: "shuffle" },
  { source: "settings", dest: "shuffle" },
  { source: "shuffle", via: "chats", dest: "shuffle" },
  { source: "shuffle", via: "boost", dest: "shuffle" },
];
const onlyRaw = argValue("--only");
const hops = (() => {
  if (!onlyRaw) return hopsAll;
  return onlyRaw.split(",").map((token) => {
    const parts = token.trim().split(/->/);
    if (parts.length === 3) {
      return { source: parts[0], via: parts[1], dest: parts[2] };
    }
    return { source: parts[0], dest: parts[1] || "shuffle" };
  });
})();

fs.mkdirSync(out, { recursive: true });
const film = path.join(out, prodReadonly ? "prod-readonly-post-arrival-filmstrip" : "local-post-arrival-filmstrip");
fs.mkdirSync(film, { recursive: true });

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function samplePostArrival(page) {
  return page.evaluate(() => {
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    function exposedLoading() {
      let text = false;
      let shell = 0;
      for (const el of document.querySelectorAll("[data-loading-shell]")) {
        if (el.closest(".sayittome-main-tab-keepalive-frozen, .sayittome-shuffle-keepalive-frozen")) {
          continue;
        }
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          parseFloat(cs.opacity) >= 0.04 &&
          r.width > 1 &&
          r.height > 1
        ) {
          shell += 1;
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
              text = true;
              break;
            }
          }
        }
        n = walker.nextNode();
      }
      return { text, shell };
    }

    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    const prep = host?.querySelector(".sayittome-shuffle-surface-prep") || host;
    const list = prep?.querySelector("[data-shuffle-list]");
    const cards = list
      ? [...list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")]
      : [];
    const cardIds = cards
      .map((el) => el.getAttribute("data-profile-id") || el.getAttribute("data-uid") || el.id || "")
      .filter(Boolean)
      .slice(0, 8);
    const hostClass = host?.className || "";
    const hostVisible = !!host?.classList.contains("sayittome-shuffle-keepalive-visible");
    const hostFrozen = !!host?.classList.contains("sayittome-shuffle-keepalive-frozen");
    const bridge = document.documentElement.hasAttribute("data-post-settle-route-bridge");
    const loading = exposedLoading();

    const mainVisible = [...document.querySelectorAll(".sayittome-main-tab-keepalive-visible")].filter(
      (el) => {
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.04;
      },
    ).length;

    const bbox = host
      ? (() => {
          const r = host.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })()
      : null;

    const visualHash = [
      location.pathname,
      hostVisible ? "V" : "F",
      hostFrozen ? "Z" : "U",
      bridge ? "B" : "N",
      String(cards.length),
      cardIds.join("|"),
      String(mainVisible),
      loading.text ? "L" : "0",
    ].join("::");

    return {
      t: performance.now(),
      pathname: location.pathname,
      hostVisible,
      hostFrozen,
      hostClass,
      bridge,
      slots: cards.length,
      cardIds,
      mainVisible,
      loadingTextAnywhere: loading.text,
      loadingShellAnywhere: loading.shell,
      blackRoot:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "black",
      presentedNone:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "none",
      bbox,
      visualHash,
      slideAttr: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
    };
  });
}

async function waitPath(page, dest, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const p = await page.evaluate(() => location.pathname);
    if (p === `/${dest}` || p.endsWith(`/${dest}`)) return true;
    await page.waitForTimeout(16);
  }
  return false;
}

async function dismissEntryLegal(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const open = await page.evaluate(() =>
      document.body.classList.contains("sayittome-entry-legal-open"),
    );
    if (!open) return;
    // Must tick the declare checkbox then accept. Never click Cancelar —
    // that navigates to "/" and strips the bottom nav (false remount fails).
    await page.evaluate(() => {
      const root = document.querySelector(".sayittome-entry-legal-modal");
      if (!root) return;
      const declare = [...root.querySelectorAll("button")].find((b) =>
        /declaro|entiendo|edad suficiente/i.test(b.textContent || ""),
      );
      declare?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      declare?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      declare?.click();
      const accept = [...root.querySelectorAll("button")].find((b) =>
        /acepto y continúo|acepto y continuo|accept and continue/i.test(
          b.textContent || "",
        ),
      );
      if (accept && !accept.disabled && !accept.className.includes("cursor-not-allowed")) {
        accept.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        accept.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        accept.click();
      }
    });
    await page.waitForTimeout(500);
    await page
      .waitForFunction(
        () => !document.body.classList.contains("sayittome-entry-legal-open"),
        null,
        { timeout: 4000 },
      )
      .catch(() => {});
  }
}

async function dismissBanners(page) {
  await dismissEntryLegal(page);
  for (let i = 0; i < 3; i += 1) {
    try {
      const dismiss = page.getByRole("button", { name: /Ahora no|Not now/i }).first();
      if (await dismiss.isVisible({ timeout: 400 }).catch(() => false)) {
        await dismiss.click({ timeout: 2000, force: true }).catch(() => {});
        await page.waitForTimeout(200);
      } else break;
    } catch {
      break;
    }
  }
  await dismissEntryLegal(page);
}

async function tapTab(page, dest) {
  await dismissBanners(page);
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const result = await page.evaluate((destTab) => {
      const tabs = [...document.querySelectorAll("[data-nav-tab]")].map((el) =>
        el.getAttribute("data-nav-tab"),
      );
      const el = document.querySelector(`[data-nav-tab="${destTab}"]`);
      if (!el) {
        return { ok: false, tabs, path: location.pathname, legal: document.body.classList.contains("sayittome-entry-legal-open") };
      }
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      if (typeof el.click === "function") el.click();
      return { ok: true, tabs, path: location.pathname, legal: false };
    }, dest);
    if (result.ok) return true;
    if (result.legal) await dismissEntryLegal(page);
    await page.waitForTimeout(100);
  }
  const diag = await page.evaluate(() => ({
    path: location.pathname,
    tabs: [...document.querySelectorAll("[data-nav-tab]")].map((el) =>
      el.getAttribute("data-nav-tab"),
    ),
    legal: document.body.classList.contains("sayittome-entry-legal-open"),
  }));
  throw new Error(`tap-tab-missing:${dest} diag=${JSON.stringify(diag)}`);
}

async function settleIdle(page) {
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const s = await samplePostArrival(page);
    if (
      s.pathname.includes("shuffle") &&
      s.hostVisible &&
      !s.bridge &&
      !s.slideAttr &&
      s.slots >= 3
    ) {
      return s;
    }
    if (!s.pathname.includes("shuffle") && !s.bridge && !s.slideAttr) {
      return s;
    }
    await page.waitForTimeout(32);
  }
  return samplePostArrival(page);
}

async function runHop(page, hop, idx) {
  const tag = hop.via
    ? `${hop.source}-via-${hop.via}-to-${hop.dest}-${idx}`
    : `${hop.source}-to-${hop.dest}-${idx}`;
  const hopDir = path.join(film, tag);
  fs.mkdirSync(hopDir, { recursive: true });

  // Ping-pong starting at /shuffle is flaky under entry-legal; boot via the via-tab
  // then soft-nav to Shuffle so bottom nav is mounted before the measured hop.
  const bootPath =
    hop.via && hop.source === "shuffle" ? hop.via : hop.source;
  await page.goto(`${base}/${bootPath}?navcapture=1&_pa=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  if (!prodReadonly) {
    await page.evaluate(() => {
      try {
        localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
        localStorage.setItem("sayittome:nav-capture", "1");
        // Classic keeps bottom nav mounted on /shuffle (modern hides it),
        // which remount hops (shuffle→chats→shuffle) require to tap via-tabs.
        localStorage.setItem("sayittome_ux_mode", "classic");
      } catch {
        /* ignore */
      }
    });
  }
  await page.waitForTimeout(800);
  // Legal modal can delay shell mount; dismiss before requiring bottom nav.
  for (let i = 0; i < 5; i += 1) {
    await dismissBanners(page);
    const navReady = await page
      .locator("[data-nav-tab]")
      .first()
      .waitFor({ state: "attached", timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (navReady) break;
    if (i === 4) throw new Error("bottom-nav-missing");
  }
  await dismissBanners(page);
  await settleIdle(page);

  if (hop.via && hop.source === "shuffle" && bootPath !== "shuffle") {
    await tapTab(page, "shuffle");
    if (!(await waitPath(page, "shuffle", 12000))) {
      throw new Error("boot-shuffle-path-timeout");
    }
    await settleIdle(page);
  }

  if (hop.via) {
    await tapTab(page, hop.via);
    if (!(await waitPath(page, hop.via, 12000))) {
      throw new Error(`via-path-timeout:/${hop.via}`);
    }
    // Wait until shuffle exit latch settles so return tap is not swallowed.
    const viaSettleStart = Date.now();
    while (Date.now() - viaSettleStart < 8000) {
      const s = await samplePostArrival(page);
      if (
        s.pathname.includes(`/${hop.via}`) &&
        !s.bridge &&
        !s.slideAttr &&
        !s.hostVisible
      ) {
        break;
      }
      // On Shuffle→main, host may remain visible briefly under exit latch;
      // accept once destination main panel is exposed.
      if (
        s.pathname.includes(`/${hop.via}`) &&
        !s.bridge &&
        !s.slideAttr &&
        s.mainVisible > 0
      ) {
        break;
      }
      await page.waitForTimeout(32);
    }
    await page.waitForTimeout(200);
  }

  const before = await samplePostArrival(page);
  const tapAt = Date.now();
  await tapTab(page, hop.dest);
  if (!(await waitPath(page, hop.dest, 12000))) {
    throw new Error(`dest-path-timeout:/${hop.dest} from=${before.pathname}`);
  }

  // Wait for arrival: bridge/slide clear + host visible + painted slots
  let arrival = null;
  const arriveStart = Date.now();
  while (Date.now() - arriveStart < 10000) {
    const s = await samplePostArrival(page);
    if (
      s.pathname.includes("shuffle") &&
      s.hostVisible &&
      !s.hostFrozen &&
      !s.bridge &&
      (!s.slideAttr || s.slideAttr === "idle") &&
      s.slots >= 3
    ) {
      arrival = s;
      break;
    }
    await page.waitForTimeout(16);
  }
  if (!arrival) arrival = await samplePostArrival(page);

  const series = [];
  const offsets = [0, 50, 100, 200, 400, 700, 1000];
  const t0 = Date.now();
  for (const off of offsets) {
    const wait = Math.max(0, off - (Date.now() - t0));
    if (wait) await page.waitForTimeout(wait);
    const s = await samplePostArrival(page);
    series.push({ offsetMs: off, ...s });
  }

  const first = series[0];
  const flashFrames = series.filter((s) => {
    const mainFlash =
      s.pathname.includes("shuffle") &&
      ((s.hostFrozen && !s.bridge) || (!s.hostVisible && s.mainVisible > 0));
    const identitySwap =
      first?.cardIds?.length &&
      s.cardIds?.length &&
      first.cardIds.join("|") !== s.cardIds.join("|");
    const hashJump = first && s.visualHash !== first.visualHash && (mainFlash || identitySwap);
    return mainFlash || hashJump;
  });

  const loadingCount = series.filter((s) => s.loadingTextAnywhere).length;
  const hostStable = series.every(
    (s) =>
      (s.pathname === "/shuffle" || s.pathname.endsWith("/shuffle")) &&
      s.hostVisible &&
      !s.hostFrozen,
  );
  const resultStable = series.every(
    (s) => !first?.cardIds?.length || s.cardIds.join("|") === first.cardIds.join("|"),
  );
  const hashStable = series.every((s) => s.visualHash === first.visualHash);
  const slotStable = series.every((s) => s.slots === first.slots);

  const gate = evaluatePostArrivalShuffleStabilityGate({
    CAPTURE_PROVIDER_SELECTED: PROVIDER,
    postArrivalFlashCount: flashFrames.length,
    loadingTextAnywhereCount: loadingCount,
    visualHashStableAfterArrival: hashStable,
    shuffleDomIdentityStable: hostStable,
    shuffleResultIdentityStable: resultStable,
    shuffleSlotIdentityStable: slotStable,
    poolRefetchVisibleDuringSettle: !resultStable,
    blackRoot: series.some((s) => s.blackRoot),
    presentedNone: series.some((s) => s.presentedNone),
  });

  const report = {
    tag,
    hop,
    tapAt,
    before,
    arrival,
    series,
    flashFrames: flashFrames.length,
    loadingTextAnywhereCount: loadingCount,
    hostStable,
    resultStable,
    hashStable,
    slotStable,
    gate,
    visualProvider: PROVIDER,
  };
  writeJson(path.join(hopDir, "hop-report.json"), report);
  return report;
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--disable-dev-shm-usage"],
  });
} catch {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
}
const context = await browser.newContext({
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const network = [];
page.on("request", (req) => {
  const u = req.url();
  if (u.includes("/api/shuffle")) {
    network.push({ t: Date.now(), url: u, type: "request" });
  }
});

const results = [];
for (const hop of hops) {
  for (let i = 0; i < repeat; i += 1) {
    try {
      results.push(await runHop(page, hop, i));
    } catch (err) {
      const fail = {
        hop,
        idx: i,
        tag: hop.via
          ? `${hop.source}-via-${hop.via}-to-${hop.dest}-${i}`
          : `${hop.source}-to-${hop.dest}-${i}`,
        error: String(err?.stack || err?.message || err),
        gate: { pass: false, status: "PROBE_ERROR" },
        flashFrames: 0,
        loadingTextAnywhereCount: 0,
        series: [],
      };
      writeJson(path.join(film, fail.tag, "hop-error.json"), fail);
      results.push(fail);
    }
  }
}

await browser.close();

const pass = results.filter((r) => r.gate?.pass).length;
const fail = results.length - pass;
const postArrivalFlashCount = results.reduce(
  (n, r) => n + Number(r.flashFrames || r.gate?.flash || 0),
  0,
);
const loadingTextAnywhereCount = results.reduce(
  (n, r) => n + Number(r.loadingTextAnywhereCount || 0),
  0,
);

const summary = {
  base,
  prodReadonly,
  visualProvider: PROVIDER,
  repeat,
  total: results.length,
  pass,
  fail,
  postArrivalFlashCount,
  loadingTextAnywhereCount,
  POST_ARRIVAL_SHUFFLE_STABILITY_GATE: fail === 0 && postArrivalFlashCount === 0,
  byHop: hops.map((h) => {
    const key = h.via ? `${h.source}->${h.via}->${h.dest}` : `${h.source}->${h.dest}`;
    const subset = results.filter((r) => {
      if (h.via) return r.hop?.via === h.via && r.hop?.source === h.source;
      return r.hop?.source === h.source && r.hop?.dest === h.dest && !r.hop?.via;
    });
    return {
      key,
      pass: subset.filter((r) => r.gate?.pass).length,
      fail: subset.filter((r) => !r.gate?.pass).length,
      flash: subset.reduce((n, r) => n + Number(r.flashFrames || 0), 0),
    };
  }),
  networkShuffleFetchCount: network.length,
  status:
    fail === 0 && postArrivalFlashCount === 0
      ? "POST_ARRIVAL_SHUFFLE_STABILITY_LIVE_PASS"
      : "SHUFFLE_POST_ARRIVAL_FLASH_TARGETED_VALIDATION_FAILED",
};

writeJson(path.join(out, "post-arrival-live-summary.json"), summary);
writeJson(path.join(out, "network-series.json"), network);
writeJson(path.join(out, "visual-hash-series.json"), results.map((r) => ({
  tag: r.tag,
  hashes: (r.series || []).map((s) => s.visualHash),
})));

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.POST_ARRIVAL_SHUFFLE_STABILITY_GATE ? 0 : 1);
