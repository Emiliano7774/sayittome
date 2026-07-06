/**
 * Visual filmstrip via CDP screencast — captures compositor-presented frames during tab switch.
 *
 * Usage:
 *   node scripts/ghost-frame-filmstrip.mjs
 *   node scripts/ghost-frame-filmstrip.mjs --base https://sayittome-app.web.app --transition chats-shuffle
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const transition = process.argv.includes("--transition")
  ? process.argv[process.argv.indexOf("--transition") + 1]
  : "chats-shuffle";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `${transition}-${Date.now()}`);

const storageState = process.argv.includes("--storage-state")
  ? process.argv[process.argv.indexOf("--storage-state") + 1]
  : "scripts/bench-storage-state.json";

const MAX_FRAMES = 60;
const CAPTURE_MS = 900;

function parseTransition(name) {
  const [from, to] = name.split("-");
  const map = {
    chats: "/chats",
    shuffle: "/shuffle",
    stories: "/stories",
    settings: "/settings",
    boost: "/boost",
    profile: "/u/navbench",
  };
  return { from: map[from] ?? `/${from}`, to: map[to] ?? `/${to}`, toTab: to };
}

async function sampleGeometry(page) {
  return page.evaluate(() => {
    function rectSummary(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        scrollTop: el.scrollTop ?? 0,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        transform: cs.transform,
        contain: cs.contain,
        zIndex: cs.zIndex,
        position: cs.position,
        overflow: cs.overflow,
        background: cs.backgroundColor,
      };
    }

    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const scrollRoot = shuffleHost?.querySelector("main[data-scroll-root]");
    const feed = shuffleHost?.querySelector("[data-shuffle-list], [data-nav-shuffle-primary]");
    const slots = shuffleHost?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ?? 0;
    const loadingShell = Boolean(shuffleHost?.querySelector("[data-loading-shell]"));
    const loadingText = /Cargando\.\.\.|Loading\.\.\./i.test(
      shuffleHost?.textContent?.slice(0, 400) ?? "",
    );

    return {
      at: Math.round(performance.now()),
      pathname: location.pathname,
      scrollY: Math.round(window.scrollY),
      clientWidth: document.documentElement.clientWidth,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      shuffleRoute: document.body.classList.contains("sayittome-shuffle-route"),
      shuffleVisible:
        shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") ?? false,
      chatsVisible:
        chatsHost?.classList.contains("sayittome-main-tab-keepalive-visible") ?? false,
      loadingShell,
      loadingText,
      visibleSlots: slots,
      shuffleHost: rectSummary(shuffleHost),
      chatsHost: rectSummary(chatsHost),
      scrollRoot: rectSummary(scrollRoot),
      feed: rectSummary(feed),
      hasScrollbar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  });
}

async function startScreencast(cdp, page) {
  const frames = [];
  let seq = 0;

  cdp.on("Page.screencastFrame", async (params) => {
    if (seq >= MAX_FRAMES) return;
    const idx = seq++;
    const geometry = await sampleGeometry(page).catch(() => null);
    frames[idx] = {
      index: idx,
      metadata: params.metadata,
      buffer: Buffer.from(params.data, "base64"),
      geometry,
    };
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    } catch {
      /* session may have ended */
    }
  });

  await cdp.send("Page.startScreencast", {
    format: "png",
    quality: 90,
    maxWidth: 780,
    maxHeight: 1688,
    everyNthFrame: 1,
  });

  return {
    getFrames: () => frames.filter(Boolean),
    stop: async () => {
      try {
        await cdp.send("Page.stopScreencast");
      } catch {
        /* ignore */
      }
    },
  };
}

function diffRatio(bufA, bufB) {
  if (!bufA || !bufB || bufA.length !== bufB.length) return 1;
  let diff = 0;
  const step = 16;
  for (let i = 0; i < bufA.length; i += step) {
    if (Math.abs(bufA[i] - bufB[i]) > 18) diff += 1;
  }
  return diff / Math.ceil(bufA.length / step);
}

function classifyFrame(geo, dChats, dShuffle) {
  if (!geo) return "H-no-geometry";
  if (geo.loadingShell || geo.loadingText) return "A-loading-shell";
  if (geo.shuffleVisible && geo.visibleSlots === 0) return "B-shuffle-empty";
  if (geo.shuffleVisible && geo.visibleSlots > 0 && geo.visibleSlots < 4) return "C-shuffle-partial";
  if (dChats < 0.03 && !geo.shuffleVisible) return "chats-valid";
  if (dShuffle < 0.04 && geo.shuffleVisible) return "shuffle-valid";
  if (dChats < 0.03) return "chats-valid-pixel";
  if (dShuffle < 0.04) return "shuffle-valid-pixel";
  if (geo.shuffleRoute && geo.chatsVisible && !geo.shuffleVisible) return "chats-with-route-class-E";
  if (!geo.chatsVisible && !geo.shuffleVisible) return "F-blank-root";
  if (dChats > 0.05 && dShuffle > 0.05) return "E-third-state-or-compositor";
  return "H-unknown";
}

async function main() {
  const { from, to, toTab } = parseTransition(transition);
  fs.mkdirSync(outDir, { recursive: true });

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

  try {
    await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);

    for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
      const btn = page.getByRole("button", { name: label });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }

    // Warm keep-alive via in-app tab clicks (no full reload between tabs).
    const shuffleTab = page.locator('[data-nav-tab="shuffle"]').first();
    const chatsTab = page.locator('[data-nav-tab="chats"]').first();

    await shuffleTab.waitFor({ state: "attached", timeout: 20000 });
    await page.waitForFunction(
      () => {
        const host = document.getElementById("sayittome-shuffle-keepalive-host");
        const list = host?.querySelector("[data-shuffle-list]");
        return (list?.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)").length ??
          0) > 0;
      },
      undefined,
      { timeout: 45000 },
    ).catch(() => {});

    await page.waitForTimeout(500);

    const refShuffleShot = await page.screenshot({ type: "png" });
    const refShuffleBuf = Buffer.from(refShuffleShot);

    await chatsTab.dispatchEvent("pointerdown");
    await chatsTab.click({ force: true, timeout: 5000 }).catch(async () => {
      await page.evaluate(() => {
        document.querySelector('[data-nav-tab="chats"]')?.click();
      });
    });
    await page.waitForURL(/\/chats/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    const refChatsShot = await page.screenshot({ type: "png" });
    const refChatsBuf = Buffer.from(refChatsShot);

    for (const label of [/Ahora no/i, /Not now/i]) {
      const btn = page.getByRole("button", { name: label });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }

    const preClick = await sampleGeometry(page);
    fs.writeFileSync(path.join(outDir, "ref-chats.png"), refChatsShot);
    fs.writeFileSync(path.join(outDir, "ref-shuffle.png"), refShuffleShot);

    const screencast = await startScreencast(cdp, page);
    const tab = page.locator(`[data-nav-tab="${toTab}"]`).first();
    await tab.waitFor({ state: "attached", timeout: 20000 });

    const clickAt = Date.now();
    await tab.dispatchEvent("pointerdown");
    await tab.click();

    await page.waitForTimeout(CAPTURE_MS);
    await screencast.stop();

    const rawFrames = screencast.getFrames();

    const analysis = [];
    for (const frame of rawFrames) {
      const file = `frame-${String(frame.index).padStart(2, "0")}.png`;
      fs.writeFileSync(path.join(outDir, file), frame.buffer);
      const dChats = diffRatio(frame.buffer, refChatsBuf);
      const dShuffle = diffRatio(frame.buffer, refShuffleBuf);
      analysis.push({
        index: frame.index,
        file,
        screencastTs: frame.metadata?.timestamp,
        diffFromChats: Number(dChats.toFixed(4)),
        diffFromShuffle: Number(dShuffle.toFixed(4)),
        classification: classifyFrame(frame.geometry, dChats, dShuffle),
        geometry: frame.geometry,
      });
    }

    await page.waitForURL((url) => url.pathname.includes(to), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const postSettled = await sampleGeometry(page);

    const ghostCandidates = analysis.filter((row) => {
      const chatsLike = row.diffFromChats < 0.035;
      const shuffleLike = row.diffFromShuffle < 0.045;
      return !chatsLike && !shuffleLike;
    });

    const report = {
      base,
      transition,
      from,
      to,
      clickAt,
      captureMs: CAPTURE_MS,
      frameCount: rawFrames.length,
      preClick,
      postSettled,
      ghostCandidateCount: ghostCandidates.length,
      ghostCandidates,
      analysis,
    };

    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

    console.log(
      JSON.stringify(
        {
          outDir,
          frameCount: rawFrames.length,
          ghostCandidateCount: ghostCandidates.length,
          ghostCandidates: ghostCandidates.slice(0, 8),
          postSettled: {
            pathname: postSettled.pathname,
            shuffleVisible: postSettled.shuffleVisible,
            chatsVisible: postSettled.chatsVisible,
            visibleSlots: postSettled.visibleSlots,
            loadingShell: postSettled.loadingShell,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
