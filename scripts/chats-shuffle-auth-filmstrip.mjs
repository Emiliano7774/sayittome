/**
 * Authenticated Chats → Shuffle warm filmstrip with full handoff state correlation.
 *
 *   node scripts/chats-shuffle-auth-filmstrip.mjs
 *   node scripts/chats-shuffle-auth-filmstrip.mjs --base https://sayittome-app.web.app
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `chats-shuffle-auth-${Date.now()}`);

const storagePath = process.argv.includes("--storage-state")
  ? process.argv[process.argv.indexOf("--storage-state") + 1]
  : "scripts/bench-storage-state.json";

const CAPTURE_MS = 1200;
const MAX_FRAMES = 80;

function loadStorageState() {
  if (!fs.existsSync(storagePath)) return null;
  const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  const origin = new URL(base).origin;
  if (!raw.origins?.some((o) => o.origin === origin)) {
    const localhostOrigin = raw.origins?.find((o) => o.origin.includes("localhost"));
    if (localhostOrigin) {
      raw.origins = [...(raw.origins || []), { ...localhostOrigin, origin }];
    }
  }
  return raw;
}

async function dismissModals(page) {
  for (const label of [
    /Mantener Español/i,
    /Keep English/i,
    /Aceptar/i,
    /Accept/i,
    /Ahora no/i,
    /Not now/i,
    /Activar/i,
    /Enable/i,
  ]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function clickNavTab(page, tabKey) {
  await page.evaluate((key) => {
    const el = document.querySelector(`[data-nav-tab="${key}"]`);
    el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    if (el && "click" in el && typeof el.click === "function") el.click();
  }, tabKey);
}

async function sampleFrameState(page) {
  return page.evaluate(() => {
    function rect(el) {
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
        zIndex: cs.zIndex,
        contain: cs.contain,
        background: cs.backgroundColor,
      };
    }

    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const prep = shuffleHost?.querySelector("[data-shuffle-surface='prep']");
    const list = prep?.querySelector("[data-shuffle-list]");
    const slots = list?.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)") ?? [];
    const firstSlot = slots[0] ?? null;
    const loadingNodes = [];
    const walker = document.createTreeWalker(prep ?? shuffleHost ?? document.body, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode();
    while (n) {
      if (/Cargando\.\.\.|Loading\.\.\./i.test(n.textContent ?? "")) {
        const el = n.parentElement;
        loadingNodes.push({
          path: el
            ? `${el.tagName}${el.id ? `#${el.id}` : ""}${el.hasAttribute("data-loading-shell") ? "[data-loading-shell]" : ""}`
            : "text",
          text: (n.textContent ?? "").trim().slice(0, 40),
        });
      }
      n = walker.nextNode();
    }

    return {
      at: Math.round(performance.now()),
      pathname: location.pathname,
      htmlClasses: Array.from(document.documentElement.classList).filter((c) =>
        c.startsWith("sayittome-"),
      ),
      bodyClasses: Array.from(document.body.classList).filter((c) =>
        c.startsWith("sayittome-"),
      ),
      effectiveTab: window.__sayittomeActiveShellTab ?? null,
      shuffleHostVisible: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") ?? false,
      shuffleHostFrozen: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-frozen") ?? false,
      chatsHostVisible: chatsHost?.classList.contains("sayittome-main-tab-keepalive-visible") ?? false,
      chatsHostFrozen: chatsHost?.classList.contains("sayittome-main-tab-keepalive-frozen") ?? false,
      handoffPending: document.documentElement.classList.contains("sayittome-shuffle-handoff-pending"),
      shuffleRevealDeferred: document.documentElement.classList.contains("sayittome-shuffle-handoff-pending"),
      shuffleHandoffPreparing: document.documentElement.classList.contains("sayittome-shuffle-handoff-pending"),
      paintedSlots: slots.length,
      domSlots: slots.length,
      loadingShellDom: Boolean(prep?.querySelector("[data-loading-shell]")),
      loadingTextNodes: loadingNodes,
      scrollTop: prep?.querySelector("main[data-scroll-root]")?.scrollTop ?? 0,
      shuffleHost: rect(shuffleHost),
      chatsHost: rect(chatsHost),
      feed: rect(list),
      firstSlot: rect(firstSlot),
    };
  });
}

function diffRatio(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let diff = 0;
  const step = 16;
  for (let i = 0; i < a.length; i += step) {
    if (Math.abs(a[i] - b[i]) > 18) diff += 1;
  }
  return diff / Math.ceil(a.length / step);
}

function classifyFrame(geo, dChats, dShuffle, loadingPixel) {
  if (dChats < 0.035) return "chats-stable";
  if (dShuffle < 0.04) return "shuffle-stable";
  if (loadingPixel || geo.loadingShellDom || geo.loadingTextNodes?.length) return "loading-pixel-or-dom";
  if (!geo.chatsHostVisible && !geo.shuffleHostVisible) return "black-gap";
  if (geo.shuffleHostVisible && geo.paintedSlots === 0) return "shuffle-empty";
  if (geo.shuffleHostVisible && geo.paintedSlots > 0 && geo.paintedSlots < 4) return "shuffle-partial";
  if (geo.shuffleHostVisible && dShuffle > 0.05) return "shuffle-intermediate";
  return "transient-other";
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const contextOpts = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  };
  const storage = loadStorageState();
  if (storage) contextOpts.storageState = storage;

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  try {
    await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await dismissModals(page);
    await page.waitForFunction(
      () => {
        const host = document.getElementById("sayittome-shuffle-keepalive-host");
        const list = host?.querySelector("[data-shuffle-list]");
        return (list?.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)").length ?? 0) >= 3;
      },
      undefined,
      { timeout: 90000 },
    ).catch(() => {});
    await page.waitForTimeout(1500);

    const refShuffleStable = Buffer.from(await page.screenshot({ type: "png" }));

    await clickNavTab(page, "chats");
    await page.waitForURL(/\/chats/, { timeout: 20000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector("#sayittome-main-tab-keepalive-chats [data-nav-primary-content]")),
      undefined,
      { timeout: 30000 },
    ).catch(() => {});
    await dismissModals(page);
    await page.waitForTimeout(1200);

    const refChats = Buffer.from(await page.screenshot({ type: "png" }));

    await page.evaluate(() => {
      window.__filmstripLoadingHits = [];
      const obs = new MutationObserver(() => {
        document.querySelectorAll("*").forEach((el) => {
          if (/Cargando\.\.\.|Loading\.\.\./i.test(el.textContent?.slice(0, 80) ?? "")) {
            window.__filmstripLoadingHits.push({
              at: performance.now(),
              tag: el.tagName,
              shell: el.hasAttribute("data-loading-shell"),
              path: el.closest("[data-shuffle-surface='prep']")
                ? "shuffle-prep"
                : el.closest("#sayittome-main-tab-keepalive-chats")
                  ? "chats"
                  : "other",
            });
          }
        });
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      window.__filmstripLoadingObs = obs;
    });

    const frames = [];
    let seq = 0;
    cdp.on("Page.screencastFrame", async (params) => {
      if (seq >= MAX_FRAMES) return;
      const idx = seq++;
      const geometry = await sampleFrameState(page).catch(() => null);
      frames[idx] = {
        index: idx,
        metadata: params.metadata,
        buffer: Buffer.from(params.data, "base64"),
        geometry,
      };
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      } catch {
        /* ended */
      }
    });

    await cdp.send("Page.startScreencast", {
      format: "png",
      quality: 90,
      maxWidth: 780,
      maxHeight: 1688,
      everyNthFrame: 1,
    });

    await clickNavTab(page, "shuffle");
    await page.waitForTimeout(CAPTURE_MS);
    try {
      await cdp.send("Page.stopScreencast");
    } catch {
      /* ignore */
    }

    await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const refShuffleFinal = Buffer.from(await page.screenshot({ type: "png" }));

    const loadingHits = await page.evaluate(() => {
      window.__filmstripLoadingObs?.disconnect();
      return window.__filmstripLoadingHits ?? [];
    });

    const analysis = [];
    let transientVisualStateCount = 0;
    let loadingPixelFrameCount = 0;
    let blackFrameCount = 0;
    let partialShuffleFrameCount = 0;

    for (const frame of frames.filter(Boolean)) {
      const file = `frame-${String(frame.index).padStart(2, "0")}.png`;
      fs.writeFileSync(path.join(outDir, file), frame.buffer);
      const dChats = diffRatio(frame.buffer, refChats);
      const dShuffle = diffRatio(frame.buffer, refShuffleStable);
      const geo = frame.geometry ?? {};
      const loadingPixel = /loading-pixel-or-dom/.test(
        classifyFrame(geo, dChats, dShuffle, false),
      ) === false &&
        frame.buffer.includes(Buffer.from("Cargando")) === false &&
        false;

      const pixelHasLoading = frame.buffer.length > 100;
      const cls = classifyFrame(geo, dChats, dShuffle, false);
      const chatsLike = dChats < 0.035;
      const shuffleLike = dShuffle < 0.04;
      const isTransient = !chatsLike && !shuffleLike;

      let finalCls = cls;
      if (isTransient) {
        transientVisualStateCount += 1;
        if (geo.loadingTextNodes?.length || geo.loadingShellDom) loadingPixelFrameCount += 1;
        if (!geo.chatsHostVisible && !geo.shuffleHostVisible) blackFrameCount += 1;
        if (geo.shuffleHostVisible && geo.paintedSlots > 0 && geo.paintedSlots < 4) {
          partialShuffleFrameCount += 1;
        }
        if (!chatsLike && !shuffleLike && geo.loadingTextNodes?.length) finalCls = "loading-text-dom";
      }

      analysis.push({
        index: frame.index,
        file,
        dChats: Number(dChats.toFixed(4)),
        dShuffle: Number(dShuffle.toFixed(4)),
        classification: finalCls,
        isTransient,
        geometry: geo,
        pixelHasLoading,
      });
    }

    const report = {
      base,
      transition: "chats-shuffle-auth-warm",
      captureMs: CAPTURE_MS,
      frameCount: frames.filter(Boolean).length,
      transientVisualStateCount,
      loadingPixelFrameCount,
      blackFrameCount,
      partialShuffleFrameCount,
      loadingHits,
      analysis,
    };

    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, "ref-chats.png"), refChats);
    fs.writeFileSync(path.join(outDir, "ref-shuffle-stable.png"), refShuffleStable);
    fs.writeFileSync(path.join(outDir, "ref-shuffle-final.png"), refShuffleFinal);

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
