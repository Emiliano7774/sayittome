/**
 * Extended Chats→Shuffle hop diagnostic.
 * - Captures until 2 consecutive pixel SHUFFLE_VALID + 15 tail frames
 * - Pixel vs DOM classification split
 * - LAST_SOURCE_FRAME / FIRST_NON_SOURCE_FRAME audit
 * - Optional: normal URL (no navcapture), Chrome stable, video
 *
 * Usage:
 *   node scripts/auth-real-hop-diagnostic.mjs --variant instrumented
 *   node scripts/auth-real-hop-diagnostic.mjs --variant normal
 *   node scripts/auth-real-hop-diagnostic.mjs --variant normal --chrome
 *   node scripts/auth-real-hop-diagnostic.mjs --compare
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROBE_INIT = fs.readFileSync(path.join(__dirname, "auth-capture-page-probes.js"), "utf8");
const VALIDATE_SNAPSHOT_INIT = fs.readFileSync(path.join(__dirname, "auth-validate-snapshot.js"), "utf8");

const args = process.argv.slice(2);
const base = argValue("--base") ?? "https://sayittome-app.web.app";
const variant = argValue("--variant") ?? "instrumented";
const useChrome = args.includes("--chrome");
const compareAll = args.includes("--compare");
const profileDir = path.resolve(
  argValue("--profile") ??
    (useChrome ? path.join("scripts", ".auth-capture-profile-chrome") : path.join("scripts", ".auth-capture-profile")),
);
const outDir = path.resolve(
  argValue("--out") ?? path.join("scripts", "ghost-filmstrip-out", `hop-diag-${Date.now()}`),
);

const POST_DEST_TAIL = 15;
const MIN_SHUFFLE_VALID_STREAK = 2;
const LEG2_TIMEOUT_MS = 90000;
const MAX_LEG2_FRAMES = 320;
const PIXEL_MATCH = 0.035;

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function captureUrl(pathname, v) {
  if (v === "normal") return `${base}${pathname}`;
  const join = pathname.includes("?") ? "&" : "?";
  return `${base}${pathname}${join}navcapture=1`;
}

function sha(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
}

function diffRatio(bufA, bufB) {
  if (!bufA || !bufB || bufA.length !== bufB.length) return 1;
  let diff = 0;
  const step = 24;
  for (let i = 0; i < bufA.length; i += step) {
    if (Math.abs(bufA[i] - bufB[i]) > 18) diff += 1;
  }
  return diff / Math.ceil(bufA.length / step);
}

async function detectLoadingSplashPixel(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 390;
    const h = meta.height ?? 844;
    const left = Math.floor(w * 0.2);
    const top = Math.floor(h * 0.38);
    const width = Math.floor(w * 0.6);
    const height = Math.floor(h * 0.18);
    const { data } = await sharp(buffer)
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let mid = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 3) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (l < 35) dark += 1;
      else if (l < 140) mid += 1;
      else bright += 1;
    }
    const total = dark + mid + bright || 1;
    const centerSplash = dark / total > 0.8 && mid / total > 0.015 && mid / total < 0.2 && bright / total < 0.05;

    const bodyTop = Math.floor(h * 0.22);
    const bodyHeight = Math.floor(h * 0.55);
    const { data: bodyData } = await sharp(buffer)
      .extract({ left: 0, top: bodyTop, width: w, height: bodyHeight })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bodyDark = 0;
    for (let i = 0; i < bodyData.length; i += 3) {
      const l = (bodyData[i] + bodyData[i + 1] + bodyData[i + 2]) / 3;
      if (l < 40) bodyDark += 1;
    }
    const bodyDarkRatio = bodyDark / Math.ceil(bodyData.length / 3);
    return centerSplash && bodyDarkRatio > 0.72;
  } catch {
    return false;
  }
}

async function classifyFramePixelOnly({ buffer, dChats, dShuffle, refChatsBuf, refShuffleBuf }) {
  if (refShuffleBuf && dShuffle < PIXEL_MATCH) return "SHUFFLE_VALID";
  if (await detectLoadingSplashPixel(buffer)) return "LOADING";
  if (refChatsBuf && dChats < PIXEL_MATCH) return "CHAT_VALID";
  if (refShuffleBuf && dShuffle < 0.55 && dChats > 0.06) return "PARTIAL_SHUFFLE";
  if (dChats > 0.5 && dShuffle > 0.5) return "BLACK_OR_ROOT";
  return "COMPOSITOR_GHOST";
}

function classifyFrameDom({ dChats, dShuffle, geometry, sourceMutated }) {
  const g = geometry;
  if (!g) return "OTHER";
  const loading = Boolean(g.loadingText || g.loadingShell || (g.loadingTextCount ?? 0) > 0);
  const shuffleVis = Boolean(g.shuffle?.visible || g.shuffle?.paintedInViewport);
  const chatsVis = Boolean(g.chats?.visible || g.chats?.paintedInViewport);
  if (loading) return "LOADING";
  if (!shuffleVis && !chatsVis) return "BLACK_OR_ROOT";
  if (shuffleVis && dShuffle < PIXEL_MATCH) return "SHUFFLE_VALID";
  if (chatsVis && dChats < PIXEL_MATCH) return "CHAT_VALID";
  if (sourceMutated) return "SOURCE_MUTATED";
  return "OTHER";
}

async function humanClickNavTab(page, tabId) {
  await dismissModals(page);
  await dismissChatRequestModal(page);
  const clicked = await page.evaluate((id) => {
    const el = document.querySelector(`[data-nav-tab="${id}"]`);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    el.click();
    return true;
  }, tabId);
  if (clicked) {
    await page.waitForTimeout(80);
    return;
  }
  const tab = page.locator(`[data-nav-tab="${tabId}"]`).first();
  await tab.waitFor({ state: "attached", timeout: 15000 });
  await tab.click({ force: true });
  await page.waitForTimeout(80);
}

function summarizeRingSample(item) {
  if (!item?.detail) return null;
  const d = item.detail;
  return {
    monoMs: item.monoMs,
    kind: item.kind,
    pathname: d.pathname,
    presentedSurface: d.presentedSurface,
    domSlots: d.domSlots,
    prepDomSlots: d.prepDomSlots,
    loadingShell: d.loadingShell,
    loadingShellCount: d.loadingShellCount,
    loadingTextCount: d.loadingTextCount,
    showShuffleLoading: d.showShuffleLoading,
    showShuffleFeed: d.showShuffleFeed,
    handoffPending: d.handoffPending,
    revealDeferred: d.revealDeferred,
    shuffleHost: d.shuffleHost,
    prepHost: d.prepHost,
    htmlClasses: d.htmlClasses,
    bodyClasses: d.bodyClasses,
    loadingTextNodes: d.loadingTextNodes?.slice(0, 5),
    loadingShellDetail: d.loadingShellDetail,
  };
}

async function nearestDomAtFrame(page, frameMono) {
  return page.evaluate((mono) => {
    const probes = window.__authCaptureProbes;
    if (!probes?.nearest) return null;
    const n = probes.nearest(mono);
    const summarize = (item) => {
      if (!item?.detail) return null;
      const d = item.detail;
      return {
        monoMs: item.monoMs,
        kind: item.kind,
        pathname: d.pathname,
        presentedSurface: d.presentedSurface,
        domSlots: d.domSlots,
        prepDomSlots: d.prepDomSlots,
        loadingShell: d.loadingShell,
        loadingShellCount: d.loadingShellCount,
        loadingTextCount: d.loadingTextCount,
        showShuffleLoading: d.showShuffleLoading,
        showShuffleFeed: d.showShuffleFeed,
        handoffPending: d.handoffPending,
        revealDeferred: d.revealDeferred,
        shuffleHost: d.shuffleHost,
        prepHost: d.prepHost,
        htmlClasses: d.htmlClasses,
        bodyClasses: d.bodyClasses,
        loadingTextNodes: d.loadingTextNodes,
        loadingShellDetail: d.loadingShellDetail,
      };
    };
    const loading = probes.nearestLoadingEvent?.(mono) ?? null;
    return {
      nearestBefore: summarize(n.before),
      nearestAfter: summarize(n.after),
      nearestBeforeDeltaMs: n.beforeDeltaMs,
      nearestAfterDeltaMs: n.afterDeltaMs,
      nearestLoadingEventBefore: loading?.before ?? null,
      nearestLoadingEventAfter: loading?.after ?? null,
      nearestLoadingBeforeDeltaMs: loading?.beforeDeltaMs ?? null,
      nearestLoadingAfterDeltaMs: loading?.afterDeltaMs ?? null,
    };
  }, frameMono);
}

async function sampleGeometry(page) {
  return page.evaluate(async () => {
    const validate = await window.__authValidateSnapshot?.sample?.();
    const probe = window.__authCaptureProbes?.sampleState?.();
    if (probe) {
      return {
        monoMs: Math.round(performance.timeOrigin + performance.now()),
        pathname: probe.pathname,
        ...probe,
        pathnameRouteSurface: validate?.pathnameRouteSurface ?? null,
        actualPresentedSurface: validate?.actualPresentedSurface ?? null,
        routePresentationMismatch: validate?.routePresentationMismatch ?? false,
        handoff: validate?.handoff ?? probe.navCapture ?? null,
        validate,
      };
    }
    return { monoMs: Math.round(performance.timeOrigin + performance.now()), pathname: location.pathname };
  });
}

async function auditLoadingNodes(page) {
  return page.evaluate(() => {
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? "";
      if (!LOADING_RE.test(text)) {
        node = walker.nextNode();
        continue;
      }
      const el = node.parentElement;
      if (!el) {
        node = walker.nextNode();
        continue;
      }
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shell = el.closest("[data-loading-shell]");
      const inViewport =
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      out.push({
        text,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: String(el.className || "").slice(0, 120),
        hasLoadingShellAncestor: Boolean(shell),
        path: shell ? "data-loading-shell" : el.closest("[data-shuffle-list]") ? "shuffle-feed" : "other",
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        computed: {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          zIndex: cs.zIndex,
        },
        inViewport,
        ancestorMarkers: [
          shell ? "data-loading-shell" : null,
          el.closest("#sayittome-shuffle-keepalive-host") ? "shuffle-host" : null,
          el.closest("#sayittome-main-tab-keepalive-chats") ? "chats-host" : null,
        ].filter(Boolean),
      });
      node = walker.nextNode();
    }
    return out;
  });
}

async function waitChatsStable(page, timeoutMs = 30000) {
  await page
    .waitForFunction(
      async () => {
        const snap = await window.__authValidateSnapshot?.sample?.();
        return snap?.actualPresentedSurface === "chats" && snap?.chats?.chatsRowsInVisibleSurface > 0;
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {});
}

async function waitShuffleCoherent(page, timeoutMs = 30000) {
  return page.waitForFunction(
    async () => {
      const snap = await window.__authValidateSnapshot?.sample?.();
      return (
        snap?.pathnameRouteSurface === "shuffle" &&
        snap?.actualPresentedSurface === "shuffle" &&
        !snap?.handoff?.shuffleHandoffPending &&
        (snap?.shuffle?.domSlots >= 3 || snap?.shuffle?.visibleSlots >= 3)
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function dismissModals(page) {
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function dismissChatRequestModal(page) {
  for (const label of [/Rechazar/i, /Reject/i, /Decline/i, /Cancelar/i, /Cancel/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(400);
      return true;
    }
  }
  const close = page.locator('[aria-label="Cerrar"], [aria-label="Close"]').first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

async function assertCleanShuffleRef(page) {
  const contaminated = await page.evaluate(() => {
    const text = document.body.innerText ?? "";
    return {
      chatRequest: /SOLICITUD DE CHAT|CHAT REQUEST/i.test(text),
      entryLegal: document.body.classList.contains("sayittome-entry-legal-open"),
      antesDeContinuar: /Antes de continuar|Before you continue/i.test(text),
    };
  });
  if (contaminated.chatRequest || contaminated.entryLegal || contaminated.antesDeContinuar) {
    throw new Error(`ref-shuffle-stable contaminated: ${JSON.stringify(contaminated)}`);
  }
}

async function ensureEntryLegalClosed(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const open = await page.evaluate(() => document.body.classList.contains("sayittome-entry-legal-open"));
    if (!open) return;
    await page.evaluate(() => {
      const scroll = document.querySelector(".sayittome-entry-legal-scroll");
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const declare = document.querySelector(".sayittome-entry-legal-scroll button:last-of-type");
      declare?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const checkbox = document.querySelector(
        '.sayittome-entry-legal-actions input[type="checkbox"], .sayittome-entry-legal-actions [role="checkbox"]',
      );
      checkbox?.click();
    });
    await page.waitForTimeout(200);
    const accept = page.getByRole("button", { name: /Acepto y continúo|I accept and continue/i });
    if (await accept.isEnabled().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(600);
      continue;
    }
    await page.evaluate(() => {
      const acceptBtn = document.querySelector(".sayittome-entry-legal-actions button:last-of-type");
      acceptBtn?.click();
    });
    await page.waitForTimeout(600);
  }
}

async function waitForSessionSignals(page, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      () => {
        const bottomNav = Boolean(document.querySelector("[data-nav-tab]"));
        const firebase = Boolean(window.firebase || window.__FIREBASE_DEFAULTS__);
        return bottomNav && (firebase || document.querySelector("nav"));
      },
      undefined,
      { timeout: timeoutMs },
    );
    return { ok: true };
  } catch {
    return { ok: false, timedOut: true };
  }
}

async function validateHydratedSession(page) {
  const probe = await page.evaluate(async () => window.__authValidateSnapshot?.sample?.());
  if (!probe) return { valid: false, reason: "validate-snapshot-missing", probe: null };
  const valid = Boolean(probe.validForVisualEvidence);
  return { valid, reason: valid ? undefined : "session-not-ready", probe };
}

async function bootstrapSession(page, v) {
  await page.goto(captureUrl("/shuffle", v), { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await dismissModals(page);
  await ensureEntryLegalClosed(page);
  await waitForSessionSignals(page, 25000);
  await page.waitForTimeout(800);
  return validateHydratedSession(page);
}

async function launchContext(v, opts = {}) {
  const chrome = opts.useChrome ?? useChrome;
  const profile = opts.profileDir ?? profileDir;
  fs.mkdirSync(profile, { recursive: true });
  const launchOpts = {
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: path.join(opts.outDir ?? outDir, "video"), size: { width: 390, height: 844 } },
  };
  if (chrome) launchOpts.channel = "chrome";

  const context = await chromium.launchPersistentContext(profile, launchOpts);
  await context.addInitScript({ content: PROBE_INIT });
  await context.addInitScript({ content: VALIDATE_SNAPSHOT_INIT });
  return context;
}

async function runHopDiagnostic(runVariant, runOutDir, opts = {}) {
  fs.mkdirSync(runOutDir, { recursive: true });
  fs.mkdirSync(path.join(runOutDir, "chats-to-shuffle"), { recursive: true });

  const context = await launchContext(runVariant, { ...opts, outDir: runOutDir });
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  const timeline = [];
  const frames = [];

  try {
    const validation = await bootstrapSession(page, runVariant);
    if (!validation.valid) {
      return {
        status: "INVALID",
        reason: validation.reason,
        auth: validation.probe?.auth,
        runVariant,
        runOutDir,
      };
    }

    await waitShuffleCoherent(page, 25000).catch(() => {});
    for (let refAttempt = 0; refAttempt < 4; refAttempt += 1) {
      await dismissModals(page);
      await ensureEntryLegalClosed(page);
      await dismissChatRequestModal(page);
      await page.waitForTimeout(400);
      const clean = await page.evaluate(() => ({
        chatRequest: /SOLICITUD DE CHAT|CHAT REQUEST/i.test(document.body.innerText ?? ""),
        entryLegal: document.body.classList.contains("sayittome-entry-legal-open"),
        antesDeContinuar: /Antes de continuar|Before you continue/i.test(document.body.innerText ?? ""),
      }));
      if (!clean.chatRequest && !clean.entryLegal && !clean.antesDeContinuar) break;
      if (refAttempt === 3) {
        throw new Error(`ref-shuffle-stable contaminated after dismiss: ${JSON.stringify(clean)}`);
      }
    }
    await assertCleanShuffleRef(page);
    const refShuffleBuf = Buffer.from(await page.screenshot({ type: "png" }));
    fs.writeFileSync(path.join(runOutDir, "ref-shuffle-stable.png"), refShuffleBuf);

    await humanClickNavTab(page, "chats");
    await page.waitForURL(/\/chats/, { timeout: 20000 });
    await waitChatsStable(page);
    await dismissChatRequestModal(page);
    await page.waitForTimeout(500);

    const refChatsBuf = Buffer.from(await page.screenshot({ type: "png" }));
    fs.writeFileSync(path.join(runOutDir, "ref-chats-stable.png"), refChatsBuf);

    const shuffleHostBeforeHop = await page.evaluate(() => window.__authCaptureProbes?.hostOwnershipState?.());
    const pointerdownMono = await page.evaluate(() => Math.round(performance.timeOrigin + performance.now()));
    timeline.push({ monoMs: pointerdownMono, kind: "pointerdown-shuffle" });

    let seq = 0;
    let lastSourceIdx = null;
    let firstNonSourceIdx = null;
    let firstShuffleValidIdx = null;
    let shuffleValidStreak = 0;
    let postTailRemaining = -1;
    let leg2Resolve;
    let leg2Status = "running";
    const leg2Done = new Promise((resolve) => {
      leg2Resolve = resolve;
    });

    const onFrame = async (params) => {
      if (seq >= MAX_LEG2_FRAMES) {
        leg2Status = "CAPTURE_INVALID_INCOMPLETE_DESTINATION";
        leg2Resolve(leg2Status);
        return;
      }
      const idx = seq++;
      let framePresentedMono = null;
      let geometry = null;
      try {
        framePresentedMono = await page.evaluate(() =>
          Math.round(performance.timeOrigin + performance.now()),
        );
        geometry = await sampleGeometry(page);
      } catch {
        try {
          await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
        } catch {
          /* ended */
        }
        return;
      }
      const buffer = Buffer.from(params.data, "base64");
      const dChats = diffRatio(buffer, refChatsBuf);
      const dShuffle = diffRatio(buffer, refShuffleBuf);
      const sourceMutated = dChats >= 0.02 && dChats < 0.35;
      const pixelClassification = await classifyFramePixelOnly({
        buffer,
        dChats,
        dShuffle,
        refChatsBuf,
        refShuffleBuf,
      });
      const domClassification = classifyFrameDom({ dChats, dShuffle, geometry, sourceMutated });
      const nearestDom = await nearestDomAtFrame(page, framePresentedMono).catch(() => null);

      if (pixelClassification === "CHAT_VALID") lastSourceIdx = idx;
      if (firstNonSourceIdx === null && pixelClassification !== "CHAT_VALID") {
        firstNonSourceIdx = idx;
      }

      if (pixelClassification === "SHUFFLE_VALID") {
        if (firstShuffleValidIdx === null) firstShuffleValidIdx = idx;
        shuffleValidStreak += 1;
        if (shuffleValidStreak >= MIN_SHUFFLE_VALID_STREAK && postTailRemaining < 0) {
          const destReady = await page
            .evaluate(async () => {
              const snap = await window.__authValidateSnapshot?.sample?.();
              return (
                snap?.actualPresentedSurface === "shuffle" &&
                !snap?.handoff?.shuffleHandoffPending &&
                (snap?.shuffle?.domSlots >= 3 || snap?.shuffle?.visibleSlots >= 3)
              );
            })
            .catch(() => false);
          if (destReady) postTailRemaining = POST_DEST_TAIL;
        }
      } else {
        shuffleValidStreak = 0;
      }

      const frame = {
        index: idx,
        framePresentedAtMono: framePresentedMono,
        deltaFromPointerMs: framePresentedMono - pointerdownMono,
        pixelClassification,
        domClassification,
        dChats,
        dShuffle,
        geometry: geometry
          ? {
              pathname: geometry.pathname,
              actualPresentedSurface: geometry.actualPresentedSurface,
              handoffPending: geometry.validate?.handoff?.shuffleHandoffPending ?? false,
              domSlots: geometry.domSlots,
              loadingShell: geometry.loadingShell,
              loadingTextCount: geometry.loadingTextCount,
            }
          : null,
        nearestDom,
        bufferHash: sha(buffer),
      };
      frames.push(frame);
      fs.writeFileSync(
        path.join(runOutDir, "chats-to-shuffle", `frame-${String(idx).padStart(2, "0")}.png`),
        buffer,
      );

      if (postTailRemaining >= 0) {
        postTailRemaining -= 1;
        if (postTailRemaining === 0) {
          leg2Status = "COMPLETE";
          leg2Resolve(leg2Status);
        }
      }

      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      } catch {
        /* ended */
      }
    };

    cdp.on("Page.screencastFrame", onFrame);
    await cdp.send("Page.startScreencast", {
      format: "png",
      quality: 92,
      maxWidth: 780,
      maxHeight: 1688,
      everyNthFrame: 1,
    });

    await humanClickNavTab(page, "shuffle");
    await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});

    const raceResult = await Promise.race([
      leg2Done,
      new Promise((r) => setTimeout(() => r("CAPTURE_INVALID_INCOMPLETE_DESTINATION"), LEG2_TIMEOUT_MS)),
    ]);
    if (raceResult !== "COMPLETE") leg2Status = raceResult;

    try {
      await cdp.send("Page.stopScreencast");
    } catch {
      /* ignore */
    }
    cdp.removeListener("Page.screencastFrame", onFrame);

    let firstNonSourceAudit = null;
    let ownershipAudit = [];
    let probeExport = null;
    if (firstNonSourceIdx != null) {
      firstNonSourceAudit = await auditLoadingNodes(page).catch(() => []);
    }

    const auditStart = Math.max(0, (lastSourceIdx ?? 0) - 2);
    const auditEnd = Math.min(
      frames.length - 1,
      (firstShuffleValidIdx ?? frames.length - 1) + POST_DEST_TAIL,
    );
    for (let i = auditStart; i <= auditEnd; i += 1) {
      const f = frames[i];
      ownershipAudit.push({
        index: f.index,
        deltaFromPointerMs: f.deltaFromPointerMs,
        pixel: f.pixelClassification,
        nearestDom: f.nearestDom,
      });
    }

    probeExport = await page.evaluate(() => window.__authCaptureProbes?.exportAll?.()).catch(() => null);

    const lastSourceFrame = lastSourceIdx != null ? frames[lastSourceIdx] : null;
    const firstNonSourceFrame = firstNonSourceIdx != null ? frames[firstNonSourceIdx] : null;
    const firstShuffleValidFrame = firstShuffleValidIdx != null ? frames[firstShuffleValidIdx] : null;

    const postDestFrames =
      firstShuffleValidIdx != null
        ? frames.filter((f) => f.index >= firstShuffleValidIdx + MIN_SHUFFLE_VALID_STREAK - 1).length
        : 0;

    const loadingPixelFrames = frames.filter((f) => f.pixelClassification === "LOADING");
    const domLoadingFrames = frames.filter((f) => f.domClassification === "LOADING");

    let manualEquivalentPath = null;
    const manualCandidate =
      loadingPixelFrames[0] ??
      frames.find((f) => f.pixelClassification === "BLACK_OR_ROOT") ??
      firstNonSourceFrame;
    if (manualCandidate) {
      manualEquivalentPath = path.join(
        runOutDir,
        "chats-to-shuffle",
        `frame-${String(manualCandidate.index).padStart(2, "0")}.png`,
      );
      if (fs.existsSync(manualEquivalentPath)) {
        fs.copyFileSync(manualEquivalentPath, path.join(runOutDir, "frame-X-manual-equivalent.png"));
      }
    }

    const handoffPendingFrames = frames.filter((f) => f.geometry?.handoffPending);
    const handoffPendingMs =
      handoffPendingFrames.length > 1
        ? handoffPendingFrames.at(-1).framePresentedAtMono - handoffPendingFrames[0].framePresentedAtMono
        : null;

    const ghostPixelMs =
      loadingPixelFrames[0] && pointerdownMono
        ? loadingPixelFrames[0].framePresentedAtMono - pointerdownMono
        : null;
    const shuffleValidMs =
      firstShuffleValidFrame && pointerdownMono
        ? firstShuffleValidFrame.framePresentedAtMono - pointerdownMono
        : null;

    const report = {
      status: leg2Status,
      runVariant,
      browser: (opts.useChrome ?? useChrome) ? "chrome-stable" : "playwright-chromium",
      base,
      profileDir: opts.profileDir ?? profileDir,
      outDir: runOutDir,
      destinationCapture: {
        completed: leg2Status === "COMPLETE",
        totalFrames: frames.length,
        firstShuffleValidIndex: firstShuffleValidIdx,
        postDestinationTailFrames: postDestFrames,
        consecutiveShuffleValidRequired: MIN_SHUFFLE_VALID_STREAK,
      },
      lastSourceFrame: lastSourceFrame
        ? {
            index: lastSourceFrame.index,
            pixelClassification: lastSourceFrame.pixelClassification,
            deltaFromPointerMs: lastSourceFrame.deltaFromPointerMs,
          }
        : null,
      firstNonSourceFrame: firstNonSourceFrame
        ? {
            index: firstNonSourceFrame.index,
            pixelClassification: firstNonSourceFrame.pixelClassification,
            domClassification: firstNonSourceFrame.domClassification,
            deltaFromPointerMs: firstNonSourceFrame.deltaFromPointerMs,
            geometry: firstNonSourceFrame.geometry,
          }
        : null,
      firstShuffleValidFrame: firstShuffleValidFrame
        ? {
            index: firstShuffleValidFrame.index,
            deltaFromPointerMs: firstShuffleValidFrame.deltaFromPointerMs,
          }
        : null,
      metrics: {
        loadingPixelFrameCount: loadingPixelFrames.length,
        domLoadingFrameCount: domLoadingFrames.length,
        classifierDisagreements: frames.filter((f) => f.pixelClassification !== f.domClassification).length,
        handoffPendingFrameCount: handoffPendingFrames.length,
        handoffPendingDurationMs: handoffPendingMs,
        pointerToFirstLoadingPixelMs: ghostPixelMs,
        pointerToFirstShuffleValidMs: shuffleValidMs,
      },
      firstNonSourceLoadingNodes: firstNonSourceAudit,
      firstNonSourceNearestDom: firstNonSourceFrame?.nearestDom ?? null,
      ownershipAuditRange: { from: auditStart, to: auditEnd, frames: ownershipAudit },
      shuffleHostBeforeHop,
      probeExportSummary: probeExport
        ? {
            ringCount: probeExport.ring?.length ?? 0,
            loadingEventCount: probeExport.loadingEvents?.length ?? 0,
            loadingEvents: probeExport.loadingEvents,
            mutations: probeExport.mutations,
          }
        : null,
      frameTable: frames.map((f) => ({
        i: f.index,
        deltaMs: f.deltaFromPointerMs,
        pixel: f.pixelClassification,
        dom: f.domClassification,
        pathname: f.geometry?.pathname,
        presented: f.geometry?.actualPresentedSurface,
        handoffPending: f.geometry?.handoffPending,
        domSlots: f.geometry?.domSlots,
        nearestBeforeDeltaMs: f.nearestDom?.nearestBeforeDeltaMs,
        nearestAfterDeltaMs: f.nearestDom?.nearestAfterDeltaMs,
        nearestBeforeLoadingShell: f.nearestDom?.nearestBefore?.loadingShell,
        nearestAfterLoadingShell: f.nearestDom?.nearestAfter?.loadingShell,
      })),
      whyPreviousZeroLoading: [
        "Prior capture ended with CHAT_VALID retained (handoff-pending); no LOADING dom/pixel in window.",
        "loadingPixelFrameCount used dom-biased classifier; destination SHUFFLE_VALID never reached.",
      ],
      manualGhostReproduced: loadingPixelFrames.length > 0 ? "YES" : "AUTOMATION_NOT_REPRODUCING_MANUAL_GHOST",
      timeline,
    };

    fs.writeFileSync(path.join(runOutDir, "report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await context.close();
    const videoDir = path.join(runOutDir, "video");
    if (fs.existsSync(videoDir)) {
      const videos = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
      if (videos[0]) {
        fs.renameSync(path.join(videoDir, videos[0]), path.join(runOutDir, "hop-leg2.webm"));
      }
    }
  }
}

async function runHopDiagnosticWithOpts({ variant, outDir: runOut, useChrome: chrome, profileDir: profile }) {
  return runHopDiagnostic(variant, runOut, { useChrome: chrome, profileDir: profile });
}

async function main() {
  if (compareAll) {
    const baseOut = outDir;
    const results = {};
    for (const [key, v] of [
      ["A-instrumented", "instrumented"],
      ["B-normal", "normal"],
    ]) {
      const dir = path.join(baseOut, key);
      results[key] = await runHopDiagnostic(v, dir);
    }
    if (useChrome) {
      results["C-chrome-normal"] = await runHopDiagnostic("normal", path.join(baseOut, "C-chrome-normal"));
    }
    fs.writeFileSync(path.join(baseOut, "compare-summary.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (args.includes("--dual-pending")) {
    const baseOut = path.resolve(path.join("scripts", "ghost-filmstrip-out", `hop-diag-dual-${Date.now()}`));
    fs.mkdirSync(baseOut, { recursive: true });
    const chromiumOut = path.join(baseOut, "corrida-2-chromium-normal");
    const chromeOut = path.join(baseOut, "corrida-1-chrome-stable");
    const chromiumReport = await runHopDiagnosticWithOpts({
      variant: "normal",
      outDir: chromiumOut,
      useChrome: false,
      profileDir: path.resolve("scripts", ".auth-capture-profile"),
    });
    const chromeReport = await runHopDiagnosticWithOpts({
      variant: "normal",
      outDir: chromeOut,
      useChrome: true,
      profileDir: path.resolve("scripts", ".auth-capture-profile-chrome-diag"),
    });
    const summary = {
      corrida1ChromeStable: chromeReport,
      corrida2ChromiumNormal: chromiumReport,
      sameGhostFrame:
        chromiumReport.firstNonSourceFrame?.pixelClassification === "LOADING" &&
        chromeReport.firstNonSourceFrame?.pixelClassification === "LOADING",
      chromiumGhostMs: chromiumReport.firstNonSourceFrame?.deltaFromPointerMs ?? null,
      chromeGhostMs: chromeReport.firstNonSourceFrame?.deltaFromPointerMs ?? null,
    };
    fs.writeFileSync(path.join(baseOut, "dual-summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode =
      chromiumReport.status === "COMPLETE" && chromeReport.status !== "INVALID" ? 0 : 2;
    return;
  }

  const report = await runHopDiagnostic(variant, outDir);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "COMPLETE" ? 0 : 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
