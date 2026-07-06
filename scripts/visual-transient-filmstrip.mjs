/**
 * Multi-transition visual filmstrip via CDP screencast.
 * Compares each frame against stable origin/destination refs; counts transient states.
 *
 * Usage:
 *   node scripts/visual-transient-filmstrip.mjs
 *   node scripts/visual-transient-filmstrip.mjs --base https://sayittome-app.web.app
 *   node scripts/visual-transient-filmstrip.mjs --transition chats-boost
 *   node scripts/visual-transient-filmstrip.mjs --all
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ALL_TRANSITIONS = [
  "shuffle-stories",
  "stories-chats",
  "chats-boost",
  "boost-settings",
  "settings-stories",
  "chats-shuffle",
  "shuffle-profile",
  "profile-chat",
  "chat-profile",
];

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const runAll = process.argv.includes("--all");
const transitionArg = process.argv.includes("--transition")
  ? process.argv[process.argv.indexOf("--transition") + 1]
  : "chats-shuffle";

const transitions = runAll ? ALL_TRANSITIONS : [transitionArg];

const outRoot = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `batch-${Date.now()}`);

const storageState = process.argv.includes("--storage-state")
  ? process.argv[process.argv.indexOf("--storage-state") + 1]
  : "scripts/bench-storage-state.json";

const PROFILE_USER = "navbench";
const MAX_FRAMES = 50;
const CAPTURE_MS = 850;
const STABLE_DIFF = 0.04;
const TRANSIENT_DIFF = 0.06;

const TAB_MAP = {
  chats: "/chats",
  shuffle: "/shuffle",
  stories: "/stories",
  settings: "/settings",
  boost: "/boost",
  profile: `/u/${PROFILE_USER}`,
  chat: null,
};

function parseTransition(name) {
  const [fromKey, toKey] = name.split("-");
  return {
    name,
    fromKey,
    toKey,
    from: TAB_MAP[fromKey] ?? `/${fromKey}`,
    to: TAB_MAP[toKey] ?? `/${toKey}`,
    fromTab: fromKey === "profile" ? null : fromKey,
    toTab: toKey === "profile" ? null : toKey,
  };
}

function diffRatio(bufA, bufB) {
  if (!bufA || !bufB) return 1;
  const len = Math.min(bufA.length, bufB.length);
  if (len === 0) return 1;
  let diff = 0;
  const step = 16;
  for (let i = 0; i < len; i += step) {
    if (Math.abs(bufA[i] - bufB[i]) > 18) diff += 1;
  }
  return diff / Math.ceil(len / step);
}

async function sampleState(page) {
  return page.evaluate(() => {
    const panels = {};
    for (const id of ["stories", "chats", "boost", "settings"]) {
      const el = document.getElementById(`sayittome-main-tab-keepalive-${id}`);
      panels[id] = {
        visible: el?.classList.contains("sayittome-main-tab-keepalive-visible") ?? false,
        frozen: el?.classList.contains("sayittome-main-tab-keepalive-frozen") ?? false,
        loadingShell: Boolean(el?.querySelector("[data-loading-shell]")),
        primary: Boolean(el?.querySelector("[data-nav-primary-content]")),
      };
    }
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const slots =
      shuffleHost?.querySelectorAll(
        "[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)",
      ).length ?? 0;
    return {
      pathname: location.pathname,
      panels,
      shuffle: {
        visible: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") ?? false,
        slots,
        loadingShell: Boolean(shuffleHost?.querySelector("[data-loading-shell]")),
        loadingText: /Cargando\.\.\.|Loading\.\.\./i.test(
          shuffleHost?.textContent?.slice(0, 400) ?? "",
        ),
      },
      bodyClasses: Array.from(document.body.classList).filter((c) =>
        c.startsWith("sayittome-"),
      ),
    };
  });
}

function classifyTransient(geo, originKey, destKey) {
  if (!geo) return { code: "H", label: "compositor/no-geometry" };
  const p = geo.panels ?? {};
  const destPanel = destKey && TAB_MAP[destKey]?.startsWith("/") ? destKey : null;

  if (geo.shuffle?.loadingShell || geo.shuffle?.loadingText) {
    return { code: "F", label: "loading-shell-shuffle" };
  }
  if (destPanel && p[destPanel]?.loadingShell) {
    return { code: "F", label: `loading-shell-${destPanel}` };
  }

  const visiblePanels = Object.entries(p)
    .filter(([, v]) => v.visible)
    .map(([k]) => k);
  if (visiblePanels.length > 1) {
    return { code: "D", label: `multi-panel:${visiblePanels.join("+")}` };
  }

  if (destKey === "shuffle" && geo.shuffle?.visible && geo.shuffle.slots === 0) {
    return { code: "B", label: "shuffle-empty" };
  }
  if (destKey === "shuffle" && geo.shuffle?.visible && geo.shuffle.slots > 0 && geo.shuffle.slots < 3) {
    return { code: "B", label: "shuffle-partial" };
  }

  if (destPanel && p[destPanel]?.visible && !geo.pathname.includes(destPanel === "settings" ? "/settings" : `/${destPanel}`)) {
    return { code: "A", label: `dest-visible-stale-path:${geo.pathname}` };
  }

  if (originKey !== "shuffle" && originKey !== "profile" && originKey !== "chat") {
    const ok = p[originKey]?.visible;
    if (geo.pathname.includes(`/${originKey}`) && !ok && visiblePanels.length === 0) {
      return { code: "G", label: "stale-origin-hidden" };
    }
  }

  if (visiblePanels.length === 0 && !geo.shuffle?.visible) {
    return { code: "D", label: "blank-root" };
  }

  const wrong = visiblePanels.find((k) => k !== destPanel && k !== originKey);
  if (wrong && destPanel) {
    return { code: "C", label: `wrong-panel:${wrong}` };
  }

  return { code: "I", label: "unclassified-transient" };
}

async function clickNavTab(page, tabKey) {
  const tab = page.locator(`[data-nav-tab="${tabKey}"]`).first();
  await tab.dispatchEvent("pointerdown").catch(() => {});
  const clicked = await tab.click({ timeout: 3000, force: true }).then(() => true).catch(() => false);
  if (!clicked) {
    await page.evaluate((key) => {
      const el = document.querySelector(`[data-nav-tab="${key}"]`);
      el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      if (el && "click" in el && typeof el.click === "function") el.click();
    }, tabKey);
  }
}

async function dismissModals(page) {
  for (const label of [
    /Mantener Español/i,
    /Keep English/i,
    /Aceptar/i,
    /Accept/i,
    /Ahora no/i,
    /Not now/i,
  ]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(350);
    }
  }
}

async function warmKeepAlive(page) {
  const order = ["shuffle", "stories", "chats", "boost", "settings"];
  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await dismissModals(page);
  await page.waitForTimeout(1200);

  for (const tab of order) {
    if (tab === "shuffle") continue;
    const el = page.locator(`[data-nav-tab="${tab}"]`).first();
    if (await el.count()) {
      await clickNavTab(page, tab);
      await page.waitForURL(new RegExp(`/${tab}`), { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }

  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForURL(/\/shuffle/, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function navigateToOrigin(page, spec) {
  if (spec.fromKey === "shuffle") {
    if (!page.url().includes("/shuffle")) {
      await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await dismissModals(page);
    }
    await page.waitForTimeout(1000);
    return;
  }
  if (spec.fromKey === "profile") {
    await page.goto(`${base}/u/${PROFILE_USER}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissModals(page);
    await page.waitForTimeout(1200);
    return;
  }
  if (spec.fromKey === "chat") {
    await page.goto(`${base}/u/${PROFILE_USER}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissModals(page);
    const chatBtn = page.getByRole("button", { name: /chat|mensaje|message/i }).first();
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
    } else {
      await page.locator('a[href*="/chat/"]').first().click({ timeout: 8000 }).catch(() => {});
    }
    await page.waitForURL(/\/chat\//, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return;
  }

  await clickNavTab(page, spec.fromTab);
  await page.waitForURL(new RegExp(spec.from.replace("/", "\\/")), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function captureTransition(page, cdp, spec, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  await navigateToOrigin(page, spec);
  await dismissModals(page);

  const refOriginShot = await page.screenshot({ type: "png" });
  const refOriginBuf = Buffer.from(refOriginShot);
  fs.writeFileSync(path.join(outDir, "ref-origin.png"), refOriginShot);

  const preClick = await sampleState(page);

  const frames = [];
  let seq = 0;
  const onFrame = async (params) => {
    if (seq >= MAX_FRAMES) return;
    const idx = seq++;
    const geometry = await sampleState(page).catch(() => null);
    frames[idx] = {
      index: idx,
      metadata: params.metadata,
      buffer: Buffer.from(params.data, "base64"),
      geometry,
    };
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    } catch {
      /* session ended */
    }
  };

  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", {
    format: "png",
    quality: 88,
    maxWidth: 780,
    maxHeight: 1688,
    everyNthFrame: 1,
  });

  if (spec.toKey === "profile") {
    const card = page.locator('[data-shuffle-list] a[href*="/u/"]').first();
    await card.click({ timeout: 12000 });
  } else if (spec.toKey === "chat") {
    const chatBtn = page.getByRole("button", { name: /chat|mensaje|message/i }).first();
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
    } else {
      await page.locator('a[href*="/chat/"]').first().click({ timeout: 8000 });
    }
  } else {
    await clickNavTab(page, spec.toTab);
  }

  await page.waitForTimeout(CAPTURE_MS);
  try {
    await cdp.send("Page.stopScreencast");
  } catch {
    /* ignore */
  }
  cdp.removeListener("Page.screencastFrame", onFrame);

  if (spec.to && spec.toKey !== "profile" && spec.toKey !== "chat") {
    await page.waitForURL(new RegExp(spec.to.replace("/", "\\/")), { timeout: 15000 }).catch(() => {});
  } else if (spec.toKey === "chat") {
    await page.waitForURL(/\/chat\//, { timeout: 15000 }).catch(() => {});
  } else if (spec.toKey === "profile") {
    await page.waitForURL(/\/u\//, { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(900);

  const refDestShot = await page.screenshot({ type: "png" });
  const refDestBuf = Buffer.from(refDestShot);
  fs.writeFileSync(path.join(outDir, "ref-dest.png"), refDestShot);

  const rawFrames = frames.filter(Boolean);
  const analysis = [];
  let transientVisualStateCount = 0;
  const transients = [];

  for (const frame of rawFrames) {
    const file = `frame-${String(frame.index).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(outDir, file), frame.buffer);
    const dOrigin = diffRatio(frame.buffer, refOriginBuf);
    const dDest = diffRatio(frame.buffer, refDestBuf);
    const originLike = dOrigin < STABLE_DIFF;
    const destLike = dDest < STABLE_DIFF;
    const isTransient = !originLike && !destLike && dOrigin > TRANSIENT_DIFF && dDest > TRANSIENT_DIFF;
    const classification = isTransient
      ? classifyTransient(frame.geometry, spec.fromKey, spec.toKey)
      : originLike
        ? { code: "origin", label: "origin-stable" }
        : destLike
          ? { code: "dest", label: "dest-stable" }
          : { code: "bridge", label: "origin-dest-bridge" };

    if (isTransient) {
      transientVisualStateCount += 1;
      transients.push({
        index: frame.index,
        file,
        classification,
        dOrigin: Number(dOrigin.toFixed(4)),
        dDest: Number(dDest.toFixed(4)),
        geometry: frame.geometry,
      });
    }

    analysis.push({
      index: frame.index,
      file,
      dOrigin: Number(dOrigin.toFixed(4)),
      dDest: Number(dDest.toFixed(4)),
      originLike,
      destLike,
      isTransient,
      classification,
      geometry: frame.geometry,
    });
  }

  const report = {
    base,
    transition: spec.name,
    from: spec.from,
    to: spec.to,
    preClick,
    postPathname: (await sampleState(page)).pathname,
    frameCount: rawFrames.length,
    transientVisualStateCount,
    transients,
    analysis,
  };

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const contextOpts = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  };
  if (fs.existsSync(storageState)) {
    contextOpts.storageState = storageState;
  }

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const summary = [];

  try {
    await warmKeepAlive(page);

    for (const t of transitions) {
      const spec = parseTransition(t);
      const outDir = path.join(outRoot, t);
      console.log(`\n--- Capturing ${t} ---`);
      const report = await captureTransition(page, cdp, spec, outDir);
      summary.push({
        transition: t,
        transientVisualStateCount: report.transientVisualStateCount,
        transients: report.transients.slice(0, 3),
        outDir,
      });
      console.log(
        JSON.stringify(
          {
            transition: t,
            transientVisualStateCount: report.transientVisualStateCount,
            topTransients: report.transients.slice(0, 2),
          },
          null,
          2,
        ),
      );
    }

    const batchReport = {
      base,
      capturedAt: new Date().toISOString(),
      transitions: summary,
      totalTransientVisualStateCount: summary.reduce((n, r) => n + r.transientVisualStateCount, 0),
    };
    fs.writeFileSync(path.join(outRoot, "batch-report.json"), JSON.stringify(batchReport, null, 2));
    console.log("\n=== BATCH SUMMARY ===");
    console.log(JSON.stringify(batchReport, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
