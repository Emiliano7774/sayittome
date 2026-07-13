/**
 * High-fidelity authenticated session filmstrip for Chats ↔ Shuffle ghost frame diagnosis.
 *
 * Strategy: persistent Chromium user-data-dir (real Firebase Auth hydration via IndexedDB).
 *
 * First-time setup (manual login once):
 *   node scripts/auth-real-filmstrip.mjs --login
 *
 * Validate hydrated session:
 *   node scripts/auth-real-filmstrip.mjs --validate
 *
 * Capture Shuffle stable → Chats → Shuffle with correlated timestamps:
 *   node scripts/auth-real-filmstrip.mjs --capture
 *   node scripts/auth-real-filmstrip.mjs --capture --diag   # also show navdiag overlay
 *
 * Options:
 *   --base https://sayittome-app.web.app
 *   --out scripts/ghost-filmstrip-out/auth-real-<timestamp>
 *   --profile scripts/.auth-capture-profile   (persistent browser profile dir)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROBE_INIT = fs.readFileSync(path.join(__dirname, "auth-capture-page-probes.js"), "utf8");
const VALIDATE_SNAPSHOT_INIT = fs.readFileSync(path.join(__dirname, "auth-validate-snapshot.js"), "utf8");

const args = process.argv.slice(2);
const base = argValue("--base") ?? "https://sayittome-app.web.app";
const profileDir = path.resolve(argValue("--profile") ?? path.join("scripts", ".auth-capture-profile"));
const outDir = path.resolve(
  argValue("--out") ?? path.join("scripts", "ghost-filmstrip-out", `auth-real-${Date.now()}`),
);
const withDiag = args.includes("--diag");
const validateHeaded = args.includes("--headed");
const modeLogin = args.includes("--login");
const modeValidate = args.includes("--validate");
const modeCapture = args.includes("--capture") || (!modeLogin && !modeValidate);

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

const CAPTURE_QUERY = withDiag ? "navcapture=1&navdiag=1" : "navcapture=1";
const MAX_FRAMES = 80;

function captureUrl(pathname = "/shuffle") {
  const join = pathname.includes("?") ? "&" : "?";
  return `${base}${pathname}${join}${CAPTURE_QUERY}`;
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

const STRUCTURAL_OK = new Set(["CHAT_VALID", "SHUFFLE_VALID"]);

const AK_LABELS = {
  CHAT_VALID: "A — Chats estable",
  SHUFFLE_VALID: "B — Shuffle estable final",
  LOADING: "C — loading shell / Cargando...",
  BLACK_OR_ROOT: "D — root/background vacío",
  STALE_SHUFFLE: "E — Shuffle anterior/stale",
  PARTIAL_SHUFFLE: "F — Shuffle parcialmente compuesto",
  SCROLL_SHIFT: "G — scroll/slots desplazados",
  COMPOSITOR_GHOST: "H — raster/layer anterior",
  CHROME_LAYOUT: "I — cambio chrome/layout",
  SOURCE_MUTATED_GHOST: "J — source Chats mutada",
  OTHER_STRUCTURAL_TRANSIENT: "K — otro transitorio estructural",
};

function classifyFrameAK(input) {
  const structural = classifyFrame(input);
  return { structural, ak: AK_LABELS[structural] ?? structural };
}

function describeFrameX(frame, refChats, refShuffle) {
  const g = frame.geometry;
  if (!g) return "sin geometría DOM";
  const parts = [];
  if (g.chats?.visible) parts.push("panel Chats visible");
  if (g.shuffle?.visible) parts.push(`panel Shuffle visible (${g.shuffle?.slots ?? 0} slots)`);
  if (!g.chats?.visible && !g.shuffle?.visible) parts.push("ningún panel keep-alive visible");
  if (g.loadingShell || g.loadingText) parts.push("loading shell/texto presente");
  if (g.bodyClasses?.includes("sayittome-shuffle-surface-active")) parts.push("body shuffle-surface-active");
  if (g.htmlClasses?.includes("sayittome-shuffle-handoff-pending")) parts.push("html shuffle-handoff-pending");
  if (frame.sourceMutated) parts.push("Chats pixel-diff vs ref estable (source mutada)");
  if (frame.dShuffle < 0.04 && g.shuffle?.visible) parts.push("pixel coincide con Shuffle ref");
  if (frame.dChats < 0.04 && g.chats?.visible) parts.push("pixel coincide con Chats ref");
  return parts.join("; ") || "estado indeterminado";
}

function classifyFrame({ dChats, dShuffle, geometry, handoff, sourceMutated }) {
  if (!geometry) return "OTHER_STRUCTURAL_TRANSIENT";
  const g = geometry;
  const v = g.validate ?? null;
  const loading = Boolean(g.loadingText || g.loadingShell || (g.loadingTextCount ?? 0) > 0);
  const shuffleVis = Boolean(
    v?.actualPresentedSurface === "shuffle" ||
      v?.surfaces?.shuffle?.paintedInViewport ||
      g.shuffle?.visible ||
      g.shuffle?.paintedInViewport,
  );
  const chatsVis = Boolean(
    v?.actualPresentedSurface === "chats" ||
      v?.surfaces?.chats?.paintedInViewport ||
      g.chats?.visible ||
      g.chats?.paintedInViewport,
  );
  const slots = Number(g.shuffle?.visibleSlots ?? g.shuffle?.slots ?? g.domSlots ?? v?.shuffle?.visibleSlots ?? 0);
  const mismatch = Boolean(v?.routePresentationMismatch ?? g.routePresentationMismatch);

  if (mismatch && chatsVis && g.pathname === "/shuffle") return "SOURCE_MUTATED_GHOST";
  if (loading) return "LOADING";
  if (!shuffleVis && !chatsVis) return "BLACK_OR_ROOT";
  if (shuffleVis && slots > 0 && slots < 3) return "PARTIAL_SHUFFLE";
  if (shuffleVis && dShuffle < 0.035) return "SHUFFLE_VALID";
  if (chatsVis && dChats < 0.035) return "CHAT_VALID";
  if (sourceMutated || g.sourceMutated) return "SOURCE_MUTATED_GHOST";
  if (shuffleVis && dShuffle >= 0.08 && dChats >= 0.08) return "COMPOSITOR_GHOST";
  if (handoff?.shuffleHandoffPreparing && chatsVis && dChats >= 0.02) return "SOURCE_MUTATED_GHOST";
  if (shuffleVis && dShuffle >= 0.06 && dShuffle < 0.035) return "STALE_SHUFFLE";
  return "OTHER_STRUCTURAL_TRANSIENT";
}

async function dismissEntryModals(page) {
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(350);
    }
  }
}

async function validateHydratedSession(page) {
  const probe = await page.evaluate(async () => {
    if (!window.__authValidateSnapshot?.sample) {
      return { error: "validate-snapshot-missing" };
    }
    return window.__authValidateSnapshot.sample();
  });

  if (probe.error) {
    return { valid: false, reason: probe.error, probe };
  }

  const valid = Boolean(probe.validForVisualEvidence);
  let reason;
  if (valid) {
    reason = probe.routePresentationMismatch
      ? "route-presentation-mismatch-ok"
      : probe.validForCapture
        ? undefined
        : "blocking-modals-present";
  } else if (probe.auth?.anonGate) {
    reason = "anon-gate";
  } else if (probe.modals?.blocking?.length) {
    reason = `blocking:${probe.modals.blocking.join(",")}`;
  } else if (!probe.auth?.authenticatedUiEvidence && probe.auth?.authProbeStatus === "unavailable") {
    reason = "auth-unknown-insufficient-ui";
  } else if (probe.captureFidelity === "insufficient") {
    reason = "capture-fidelity-insufficient";
  } else if (probe.captureFidelity === "persistence-only") {
    reason = "auth-persistence-only-no-ui";
  } else {
    reason = "session-not-ready";
  }

  return { valid, reason, probe };
}

async function collectBrowserAudit(context, page, profileDir) {
  const executablePath = chromium.executablePath();
  const singletonLock = fs.existsSync(path.join(profileDir, "SingletonLock"));
  const singletonCookie = fs.existsSync(path.join(profileDir, "SingletonCookie"));
  const cookies = await context.cookies(base).catch(() => []);
  const cookieSummary = cookies.map((c) => ({ name: c.name, domain: c.domain }));
  const pages = context.pages();

  const storageAudit = await page.evaluate(async () => {
    let indexedDbNames = [];
    try {
      indexedDbNames = (await indexedDB.databases()).map((d) => String(d.name || "")).filter(Boolean);
    } catch {
      indexedDbNames = ["indexeddb-unavailable"];
    }
    return {
      localStorageKeys: Object.keys(localStorage).filter((k) => /firebase|auth|sayittome/i.test(k)),
      sessionStorageKeys: Object.keys(sessionStorage).filter((k) => /firebase|auth|sayittome/i.test(k)),
      indexedDbNames,
      origin: location.origin,
      href: location.href,
    };
  });

  return {
    executable: executablePath,
    userDataDir: profileDir,
    profileLock: { singletonLock, singletonCookie },
    initialUrl: storageAudit.href,
    pageCount: pages.length,
    cookies: cookieSummary,
    storage: storageAudit,
  };
}

async function observeSessionTimeline(page, { maxMs = 12000, intervalMs = 300 } = {}) {
  const startedAt = Date.now();
  const samples = [];
  const markers = {};

  const mark = (key, snap) => {
    if (!markers[key]) markers[key] = { elapsedMs: Date.now() - startedAt, ...snap };
  };

  while (Date.now() - startedAt < maxMs) {
    const snap = await page.evaluate(async () => window.__authValidateSnapshot?.sample?.());
    if (!snap) break;
    const elapsedMs = Date.now() - startedAt;
    samples.push({ elapsedMs, ...snap });
    if (!markers.T0) mark("T0", snap);
    if (!markers.T1 && snap.storage?.firebasePersistenceObservable) mark("T1", snap);
    if (
      !markers.T2 &&
      (snap.auth?.authProbeStatus === "logged_in" || snap.auth?.authenticatedUiEvidence)
    ) {
      mark("T2", snap);
    }
    if (!markers.T3 && snap.chats?.chatsRowsInVisibleSurface > 0) mark("T3", snap);
    if (!markers.T4 && (snap.shuffle?.visibleSlots >= 3 || snap.shuffle?.domSlots >= 3)) mark("T4", snap);
    if (snap.captureReady && markers.T2 && (markers.T3 || markers.T4)) break;
    await page.waitForTimeout(intervalMs);
  }

  return { durationMs: Date.now() - startedAt, samples: samples.length, markers };
}

async function waitForSessionSignals(page, { timeoutMs = 15000 } = {}) {
  try {
    await page.waitForFunction(
      () => {
        const snapReady = typeof window.__authValidateSnapshot?.sample === "function";
        if (!snapReady) return false;
        const keys = Object.keys(localStorage).filter((k) => /firebase/i.test(k));
        const nav = document.querySelector('[data-nav-tab="settings"]');
        const anon = /continuar como invitado|continue as guest/i.test(
          document.body.textContent?.slice(0, 1200) ?? "",
        );
        const rows =
          document.querySelectorAll('[data-nav-chat-row], a[href*="/chat/"]').length;
        return Boolean(nav && !anon && (keys.length > 0 || rows > 2));
      },
      undefined,
      { timeout: timeoutMs },
    );
    return { ok: true };
  } catch {
    return { ok: false, timedOut: true };
  }
}

async function waitShuffleStable(page, { minStableFrames = 8, timeoutMs = 60000 } = {}) {
  await page.evaluate(() => window.__authCaptureProbes?.resetStability?.());
  await page.waitForFunction(
    ({ minStableFrames }) => {
      const r = window.__authCaptureProbes?.observeStability?.();
      return r && r.stableStreak >= minStableFrames;
    },
    { minStableFrames },
    { timeout: timeoutMs },
  );
  return page.evaluate(() => window.__authCaptureProbes?.observeStability?.());
}

async function sampleValidateSnapshot(page) {
  return page.evaluate(async () => window.__authValidateSnapshot?.sample?.());
}

async function ensureEntryLegalClosed(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.evaluate(() => document.body.classList.contains("sayittome-entry-legal-open"));
    if (!open) return { closed: true, attempts: attempt };

    await page.evaluate(() => {
      const declare = document.querySelector(".sayittome-entry-legal-scroll button:last-of-type");
      declare?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      declare?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      declare?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const accept = document.querySelector(".sayittome-entry-legal-actions button:last-of-type");
      accept?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      accept?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      accept?.click();
    });
    await page.waitForTimeout(600);
    await page
      .waitForFunction(() => !document.body.classList.contains("sayittome-entry-legal-open"), undefined, {
        timeout: 8000,
      })
      .catch(() => {});
  }

  const stillOpen = await page.evaluate(() => document.body.classList.contains("sayittome-entry-legal-open"));
  return { closed: !stillOpen, attempts: 3, stillOpen };
}

async function dismissBlockingModalsViaUi(page) {
  const dismissed = [];
  const legal = await ensureEntryLegalClosed(page);
  if (legal.closed) dismissed.push("entry-legal");
  else if (legal.stillOpen) dismissed.push("entry-legal-failed");

  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(350);
      dismissed.push(String(label));
    }
  }

  return { dismissed };
}

function isShuffleCoherentSnap(snap) {
  return Boolean(
    snap &&
      snap.pathnameRouteSurface === "shuffle" &&
      snap.actualPresentedSurface === "shuffle" &&
      !snap.routePresentationMismatch &&
      !snap.handoff?.shuffleHandoffPending &&
      (snap.shuffle?.visibleSlots >= 3 || snap.shuffle?.domSlots >= 3) &&
      !snap.shuffle?.loadingText &&
      !snap.shuffle?.loadingShell,
  );
}

async function waitShuffleCoherent(page, { timeoutMs = 45000 } = {}) {
  await page.waitForFunction(
    async () => {
      const snap = await window.__authValidateSnapshot?.sample?.();
      if (!snap) return false;
      return (
        snap.pathnameRouteSurface === "shuffle" &&
        snap.actualPresentedSurface === "shuffle" &&
        !snap.routePresentationMismatch &&
        !snap.handoff?.shuffleHandoffPending &&
        (snap.shuffle?.visibleSlots >= 3 || snap.shuffle?.domSlots >= 3) &&
        !snap.shuffle?.loadingText &&
        !snap.shuffle?.loadingShell
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
  const snap = await sampleValidateSnapshot(page);
  if (!isShuffleCoherentSnap(snap)) {
    throw new Error("shuffle-coherent-verify-failed");
  }
  return snap;
}

async function tryRecoverCoherentShuffle(page, initialSnap) {
  const steps = [];
  const needsRecovery =
    initialSnap?.routePresentationMismatch ||
    initialSnap?.handoff?.shuffleHandoffPending ||
    initialSnap?.actualPresentedSurface !== "shuffle";

  if (!needsRecovery) {
    try {
      const snap = await waitShuffleCoherent(page, { timeoutMs: 8000 });
      return { recovered: true, steps, coherentSnap: snap };
    } catch {
      /* fall through */
    }
  }

  if (initialSnap?.actualPresentedSurface === "chats" || initialSnap?.handoff?.shuffleHandoffPending) {
    steps.push("tap-shuffle-from-mismatch");
    try {
      await humanClickNavTab(page, "shuffle");
      await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const snap = await waitShuffleCoherent(page, { timeoutMs: 12000 });
      return { recovered: true, steps, coherentSnap: snap };
    } catch {
      /* continue */
    }
  }

  steps.push("tap-chats");
  try {
    await humanClickNavTab(page, "chats");
  } catch (error) {
    return {
      recovered: false,
      steps,
      stuck: true,
      classification: "HANDOFF_STUCK_STATE",
      coherentSnap: await sampleValidateSnapshot(page),
      error: `bottom-nav-chats-unclickable: ${error}`,
    };
  }
  await page.waitForURL(/\/chats/, { timeout: 20000 }).catch(() => {});
  await waitChatsStable(page).catch(() => {});
  await page.waitForTimeout(600);

  steps.push("tap-shuffle");
  try {
    await humanClickNavTab(page, "shuffle");
  } catch (error) {
    return {
      recovered: false,
      steps,
      stuck: true,
      classification: "HANDOFF_STUCK_STATE",
      coherentSnap: await sampleValidateSnapshot(page),
      error: `bottom-nav-shuffle-unclickable: ${error}`,
    };
  }
  await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});

  try {
    const snap = await waitShuffleCoherent(page, { timeoutMs: 45000 });
    if (isShuffleCoherentSnap(snap)) return { recovered: true, steps, coherentSnap: snap };
  } catch (error) {
    const stuckSnap = await sampleValidateSnapshot(page);
    return {
      recovered: false,
      steps,
      stuck: true,
      classification: "HANDOFF_STUCK_STATE",
      coherentSnap: stuckSnap,
      error: String(error),
    };
  }
}

async function waitChatsStable(page, { timeoutMs = 30000 } = {}) {
  await page.waitForFunction(
    async () => {
      const snap = await window.__authValidateSnapshot?.sample?.();
      if (!snap) return false;
      return (
        snap.actualPresentedSurface === "chats" &&
        snap.chats?.chatsRowsInVisibleSurface > 0 &&
        !snap.chats?.chatsLoading
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function waitBottomNavTabClickable(page, tabId, { timeoutMs = 30000 } = {}) {
  await page.waitForFunction(
    (tab) => {
      if (document.body.classList.contains("sayittome-entry-legal-open")) return false;
      const el = document.querySelector(`[data-nav-tab="${tab}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 8 && r.height > 8 && cs.display !== "none" && cs.visibility !== "hidden";
    },
    tabId,
    { timeout: timeoutMs },
  );
}

async function humanClickNavTab(page, tabId) {
  try {
    await waitBottomNavTabClickable(page, tabId, { timeoutMs: 12000 });
  } catch {
    const clicked = await page.evaluate((tab) => {
      const el = document.querySelector(`[data-nav-tab="${tab}"]`);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      el.click();
      return true;
    }, tabId);
    if (!clicked) throw new Error(`nav tab missing: ${tabId}`);
    await page.waitForTimeout(80);
    return;
  }
  const tab = page.locator(`[data-nav-tab="${tabId}"]`).first();
  const box = await tab.boundingBox();
  if (!box) throw new Error(`nav tab not clickable: ${tabId}`);

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(40);
  await page.mouse.down();
  await page.waitForTimeout(35);
  await page.mouse.up();
}

async function sampleGeometry(page) {
  return page.evaluate(async () => {
    const validate = await window.__authValidateSnapshot?.sample?.();
    const probe = window.__authCaptureProbes?.sampleState?.();
    if (probe) {
      const capture = window.__sayittomeNavCapture;
      return {
        monoMs: Math.round(performance.timeOrigin + performance.now()),
        ...probe,
        shuffle: {
          visible: probe.shuffleVisible,
          frozen: probe.shuffleFrozen,
          slots: probe.domSlots,
          visibleSlots: validate?.shuffle?.visibleSlots ?? 0,
          paintedInViewport: validate?.surfaces?.shuffle?.paintedInViewport ?? false,
          ...probe.shuffleHost,
        },
        chats: {
          visible: probe.chatsVisible,
          frozen: probe.chatsFrozen,
          rowsVisible: validate?.chats?.chatsRowsInVisibleSurface ?? 0,
          rowsTotal: validate?.chats?.chatsDomRowsTotal ?? 0,
          paintedInViewport: validate?.surfaces?.chats?.paintedInViewport ?? false,
          ...probe.chatsHost,
        },
        loadingShell: probe.loadingShell,
        loadingText: probe.loadingTextCount > 0,
        loadingTextCount: probe.loadingTextCount,
        navCapture: capture?.state?.() ?? probe.navCapture ?? null,
        handoff: capture?.sampleDom?.()?.handoff ?? validate?.handoff ?? null,
        pathnameRouteSurface: validate?.pathnameRouteSurface ?? null,
        actualPresentedSurface: validate?.actualPresentedSurface ?? null,
        routePresentationMismatch: validate?.routePresentationMismatch ?? false,
        validate,
      };
    }

    function panel(id, visibleClass, frozenClass) {
      const el = document.getElementById(id);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        visible: el.classList.contains(visibleClass),
        frozen: el.classList.contains(frozenClass),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
      };
    }

    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const slots =
      shuffleHost?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)")
        .length ?? 0;
    const loadingShell = Boolean(shuffleHost?.querySelector("[data-loading-shell]"));
    const loadingText = /Cargando\.\.\.|Loading\.\.\./i.test(
      `${shuffleHost?.textContent?.slice(0, 300) ?? ""}${chatsHost?.textContent?.slice(0, 200) ?? ""}`,
    );

    const capture = window.__sayittomeNavCapture;
    const dom = capture?.sampleDom?.();

    return {
      monoMs: Math.round(performance.timeOrigin + performance.now()),
      pathname: location.pathname,
      shuffle: shuffleHost
        ? { ...panel("sayittome-shuffle-keepalive-host", "sayittome-shuffle-keepalive-visible", "sayittome-shuffle-keepalive-frozen"), slots }
        : null,
      chats: panel(
        "sayittome-main-tab-keepalive-chats",
        "sayittome-main-tab-keepalive-visible",
        "sayittome-main-tab-keepalive-frozen",
      ),
      loadingShell,
      loadingText,
      htmlClasses: [...document.documentElement.classList].filter((c) => c.startsWith("sayittome-")),
      bodyClasses: [...document.body.classList].filter((c) => c.startsWith("sayittome-")),
      navCapture: capture?.state?.() ?? null,
      handoff: dom?.handoff ?? null,
    };
  });
}

async function correlateFrame(page, framePresentedMono) {
  return page.evaluate((mono) => {
    const probes = window.__authCaptureProbes?.nearest?.(mono) ?? null;
    const nav = window.__sayittomeNavCapture?.nearestDom?.(mono) ?? null;
    const pointers = window.__authCaptureProbes?.exportAll?.().pointers ?? [];
    const lastPointer = [...pointers].reverse().find((p) => p.monoMs <= mono);
    return { probes, nav, lastPointer };
  }, framePresentedMono);
}

function buildFrameRecord({
  idx,
  leg,
  buffer,
  framePresentedMono,
  geometry,
  correlation,
  refChatsBuf,
  refShuffleBuf,
}) {
  const dChats = refChatsBuf ? diffRatio(buffer, refChatsBuf) : 1;
  const dShuffle = refShuffleBuf ? diffRatio(buffer, refShuffleBuf) : 1;
  const chatsVis = Boolean(geometry?.chats?.visible);
  const sourceMutated = Boolean(refChatsBuf && chatsVis && dChats >= 0.02 && dChats < 0.35);
  const clsInput = { dChats, dShuffle, geometry, handoff: geometry?.handoff, sourceMutated };
  const { structural, ak } = classifyFrameAK(clsInput);

  return {
    index: idx,
    leg,
    framePresentedAtMono: framePresentedMono,
    domSampleAfterMono: geometry?.monoMs ?? null,
    domSampleAfterDeltaMs: geometry?.monoMs != null ? geometry.monoMs - framePresentedMono : null,
    domCorrelation: {
      ringBefore: correlation?.probes?.before ?? null,
      ringAfter: correlation?.probes?.after ?? null,
      ringBeforeDeltaMs: correlation?.probes?.beforeDeltaMs ?? null,
      ringAfterDeltaMs: correlation?.probes?.afterDeltaMs ?? null,
      navCaptureNearest: correlation?.nav ?? null,
      lastPointerBeforeFrame: correlation?.lastPointer ?? null,
    },
    geometry,
    classification: structural,
    classificationAK: ak,
    dChats,
    dShuffle,
    sourceMutated,
    isSuspectGhost: !STRUCTURAL_OK.has(structural),
    bufferHash: sha(buffer),
  };
}

async function launchPersistent(headless) {
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    args: headless ? [] : ["--start-maximized"],
  });

  await context.addInitScript({ content: PROBE_INIT });
  await context.addInitScript({ content: VALIDATE_SNAPSHOT_INIT });
  return context;
}

async function runLogin() {
  const context = await launchPersistent(false);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(captureUrl("/shuffle"), { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("\n[auth-real-filmstrip] LOGIN MODE");
  console.log(`Profile dir: ${profileDir}`);
  console.log(`URL: ${captureUrl("/shuffle")}`);
  console.log("\nPasos:");
  console.log("  1. Iniciá sesión en la UI normal de SayItToMe (no escribas password en esta terminal).");
  console.log("  2. Cerrá modales: idioma, legal, notificaciones si aparecen.");
  console.log("  3. Andá a Shuffle y esperá feed con perfiles reales (3+ slots).");
  console.log("  4. Volvé a esta terminal y presioná Enter.\n");
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });
  const validation = await validateHydratedSession(page);
  console.log(JSON.stringify({ step: "post-login-validation", ...validation }, null, 2));
  await context.close();
  process.exit(validation.valid ? 0 : 2);
}

async function runValidate() {
  const artifactDir = path.join(__dirname, "ghost-filmstrip-out", "validate-latest");
  fs.mkdirSync(artifactDir, { recursive: true });

  const context = await launchPersistent(validateHeaded ? false : true);
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(captureUrl("/shuffle"), { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await dismissEntryModals(page);
  await ensureEntryLegalClosed(page);

  const audit = await collectBrowserAudit(context, page, profileDir);

  const waitSignals = await waitForSessionSignals(page, { timeoutMs: 20000 });
  const timeline = await observeSessionTimeline(page, { maxMs: 12000, intervalMs: 300 });
  const validation = await validateHydratedSession(page);

  const mismatchShotPath = path.join(artifactDir, "validate-mismatch-frame.png");
  if (validation.probe?.routePresentationMismatch) {
    await page.screenshot({ path: mismatchShotPath, type: "png", fullPage: false });
  }

  const screenshotPath = path.join(artifactDir, "validate-frame.png");
  await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });

  const report = {
    step: "validate",
    base,
    profileDir,
    headed: validateHeaded,
    browser: audit,
    waitSignals,
    timeline,
    valid: validation.valid,
    validForCapture: validation.probe?.validForCapture,
    validForVisualEvidence: validation.probe?.validForVisualEvidence,
    reason: validation.reason,
    classification: validation.probe?.classification,
    captureFidelity: validation.probe?.captureFidelity,
    routePresentationMismatch: validation.probe?.routePresentationMismatch,
    pathnameRouteSurface: validation.probe?.pathnameRouteSurface,
    actualPresentedSurface: validation.probe?.actualPresentedSurface,
    auth: {
      authProbeStatus: validation.probe?.auth?.authProbeStatus,
      probeAvailable: validation.probe?.auth?.probeAvailable,
      authenticatedUiEvidence: validation.probe?.auth?.authenticatedUiEvidence,
      uid: validation.probe?.auth?.uid,
      isAnonymous: validation.probe?.auth?.isAnonymous,
      username: validation.probe?.auth?.username,
      firebasePersistenceObservable: validation.probe?.auth?.firebasePersistenceObservable,
    },
    chats: validation.probe?.chats,
    shuffle: validation.probe?.shuffle,
    surfaces: validation.probe?.surfaces,
    modals: validation.probe?.modals,
    navigation: validation.probe?.navigation,
    handoff: validation.probe?.handoff,
    htmlClasses: validation.probe?.htmlClasses,
    bodyClasses: validation.probe?.bodyClasses,
    artifacts: {
      screenshot: screenshotPath,
      mismatchScreenshot: validation.probe?.routePresentationMismatch ? mismatchShotPath : null,
    },
    probe: validation.probe,
  };

  fs.writeFileSync(path.join(artifactDir, "validate-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  process.exit(validation.valid ? 0 : 2);
}

async function startTracing(cdp) {
  await cdp.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: {
      includedCategories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.frame",
        "disabled-by-default-devtools.timeline.stack",
        "blink",
      ],
    },
  });
}

async function stopTracing(cdp, tracePath) {
  const ended = await cdp.send("Tracing.end");
  const streamHandle = ended.stream;
  if (!streamHandle) return null;
  let traceData = "";
  let eof = false;
  while (!eof) {
    const chunk = await cdp.send("IO.read", { handle: streamHandle });
    traceData += chunk.data;
    eof = chunk.eof;
  }
  await cdp.send("IO.close", { handle: streamHandle });
  fs.writeFileSync(tracePath, traceData);
  return tracePath;
}

async function runCapture() {
  fs.mkdirSync(outDir, { recursive: true });
  const context = await launchPersistent(true);
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);

  const timeline = [];
  const frames = [];
  let refChatsBuf = null;
  let refShuffleBuf = null;
  let refChatsGeom = null;
  let refShuffleGeom = null;

  try {
    await page.goto(captureUrl("/shuffle"), { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1200);

    const initialSnap = await sampleValidateSnapshot(page);
    const initialHandoff = initialSnap?.handoff ?? null;
    const initialMismatch = Boolean(initialSnap?.routePresentationMismatch);

    fs.writeFileSync(path.join(outDir, "initial-handoff-state.json"), JSON.stringify(initialSnap, null, 2));
    if (initialMismatch) {
      const mismatchPath = path.join(outDir, "validate-mismatch-frame.png");
      await page.screenshot({ path: mismatchPath, type: "png" });
      const validateLatestDir = path.join(__dirname, "ghost-filmstrip-out", "validate-latest");
      fs.mkdirSync(validateLatestDir, { recursive: true });
      fs.copyFileSync(mismatchPath, path.join(validateLatestDir, "validate-mismatch-frame.png"));
    }

    timeline.push({
      monoMs: initialSnap?.monoMs,
      kind: "session-start",
      classification: initialSnap?.classification,
      routePresentationMismatch: initialMismatch,
      pathnameRouteSurface: initialSnap?.pathnameRouteSurface,
      actualPresentedSurface: initialSnap?.actualPresentedSurface,
      handoff: initialHandoff,
    });

    const modalDismiss = await dismissBlockingModalsViaUi(page);
    if (modalDismiss.dismissed.length) {
      timeline.push({ kind: "modal-dismissed-via-ui", dismissed: modalDismiss.dismissed });
    }
    if (modalDismiss.dismissed.includes("entry-legal-failed")) {
      const blocked = {
        status: "BLOCKED",
        reason: "entry-legal-modal-still-open",
        initialSnap,
        modalDismiss,
        hint: "Close legal modal manually then re-run capture:auth",
      };
      fs.writeFileSync(path.join(outDir, "blocked.json"), JSON.stringify(blocked, null, 2));
      console.log(JSON.stringify(blocked, null, 2));
      process.exitCode = 2;
      return;
    }

    await waitForSessionSignals(page, { timeoutMs: 25000 });
    await page.waitForTimeout(500);

    const validation = await validateHydratedSession(page);
    if (!validation.probe?.validForVisualEvidence) {
      const invalid = {
        status: "INVALID",
        reason: validation.reason,
        probe: validation.probe,
        initialSnap,
        hint: "Run: node scripts/auth-real-filmstrip.mjs --login",
      };
      fs.writeFileSync(path.join(outDir, "invalid.json"), JSON.stringify(invalid, null, 2));
      console.log(JSON.stringify(invalid, null, 2));
      process.exitCode = 2;
      return;
    }

    const recovery = await tryRecoverCoherentShuffle(page, initialSnap);
    timeline.push({
      kind: "shuffle-recovery",
      recovered: recovery.recovered,
      steps: recovery.steps,
      classification: recovery.classification ?? (recovery.recovered ? "COHERENT_SHUFFLE" : null),
      coherentSnap: {
        pathnameRouteSurface: recovery.coherentSnap?.pathnameRouteSurface,
        actualPresentedSurface: recovery.coherentSnap?.actualPresentedSurface,
        routePresentationMismatch: recovery.coherentSnap?.routePresentationMismatch,
        handoff: recovery.coherentSnap?.handoff,
        shuffle: recovery.coherentSnap?.shuffle,
      },
    });

    if (recovery.recovered) {
      await waitShuffleStable(page).catch(() => {});
      refShuffleBuf = Buffer.from(await page.screenshot({ type: "png" }));
      refShuffleGeom = await sampleGeometry(page);
      fs.writeFileSync(path.join(outDir, "ref-shuffle-stable.png"), refShuffleBuf);
    } else {
      fs.writeFileSync(
        path.join(outDir, "handoff-stuck-state.json"),
        JSON.stringify(
          {
            classification: "HANDOFF_STUCK_STATE",
            recovery,
            snap: recovery.coherentSnap,
          },
          null,
          2,
        ),
      );
    }

    await startTracing(cdp);

    // --- leg 1: Shuffle → Chats (only if we have coherent shuffle, else skip to chats if visible) ---
    const leg1Dir = path.join(outDir, "shuffle-to-chats");
    fs.mkdirSync(leg1Dir, { recursive: true });

    let seq = 0;
    const onScreencast = async (params) => {
      if (seq >= MAX_FRAMES) return;
      const idx = seq++;
      const framePresentedMono = await page.evaluate(() =>
        Math.round(performance.timeOrigin + performance.now()),
      );
      const geometry = await sampleGeometry(page).catch(() => null);
      const correlation = await correlateFrame(page, framePresentedMono).catch(() => null);
      const buffer = Buffer.from(params.data, "base64");
      const frame = buildFrameRecord({
        idx,
        leg: "shuffle-to-chats",
        buffer,
        framePresentedMono,
        geometry,
        correlation,
        refChatsBuf,
        refShuffleBuf,
      });
      frames.push(frame);
      fs.writeFileSync(path.join(leg1Dir, `frame-${String(idx).padStart(2, "0")}.png`), buffer);
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      } catch {
        /* ended */
      }
    };

    if (recovery.recovered) {
      cdp.on("Page.screencastFrame", onScreencast);
      await cdp.send("Page.startScreencast", {
        format: "png",
        quality: 92,
        maxWidth: 780,
        maxHeight: 1688,
        everyNthFrame: 1,
      });

      const preClickMono = await page.evaluate(() => Math.round(performance.timeOrigin + performance.now()));
      timeline.push({ monoMs: preClickMono, kind: "pre-pointerdown", leg: "shuffle-to-chats", tab: "chats" });
      await page.evaluate(() => window.__sayittomeNavCapture?.begin?.("shuffle-to-chats"));

      await humanClickNavTab(page, "chats");
      await page.waitForURL(/\/chats/, { timeout: 20000 });
      await waitChatsStable(page).catch(() => {});
      await page.waitForTimeout(800);

      try {
        await cdp.send("Page.stopScreencast");
      } catch {
        /* ignore */
      }
      cdp.removeListener("Page.screencastFrame", onScreencast);
    } else {
      timeline.push({ kind: "leg1-skipped", reason: "HANDOFF_STUCK_STATE" });
    }

    refChatsBuf = Buffer.from(await page.screenshot({ type: "png" }));
    refChatsGeom = await sampleGeometry(page);
    fs.writeFileSync(path.join(outDir, "ref-chats-stable.png"), refChatsBuf);

    const preLeg2Legal = await ensureEntryLegalClosed(page).catch(() => ({ closed: false }));
    if (!preLeg2Legal.closed) {
      timeline.push({ kind: "pre-leg2-legal-still-open", preLeg2Legal });
    }

    // --- leg 2: Chats → Shuffle (ghost frame target) ---
    const leg2Dir = path.join(outDir, "chats-to-shuffle");
    fs.mkdirSync(leg2Dir, { recursive: true });
    seq = 0;

    const onScreencast2 = async (params) => {
      if (seq >= MAX_FRAMES) return;
      const idx = seq++;
      const framePresentedMono = await page.evaluate(() =>
        Math.round(performance.timeOrigin + performance.now()),
      );
      const geometry = await sampleGeometry(page).catch(() => null);
      const correlation = await correlateFrame(page, framePresentedMono).catch(() => null);
      const buffer = Buffer.from(params.data, "base64");
      const frame = buildFrameRecord({
        idx,
        leg: "chats-to-shuffle",
        buffer,
        framePresentedMono,
        geometry,
        correlation,
        refChatsBuf,
        refShuffleBuf,
      });
      frames.push(frame);
      fs.writeFileSync(path.join(leg2Dir, `frame-${String(idx).padStart(2, "0")}.png`), buffer);
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      } catch {
        /* ended */
      }
    };

    cdp.on("Page.screencastFrame", onScreencast2);
    await cdp.send("Page.startScreencast", {
      format: "png",
      quality: 92,
      maxWidth: 780,
      maxHeight: 1688,
      everyNthFrame: 1,
    });

    const preClick2Mono = await page.evaluate(() => Math.round(performance.timeOrigin + performance.now()));
    timeline.push({ monoMs: preClick2Mono, kind: "pre-pointerdown", leg: "chats-to-shuffle", tab: "shuffle" });
    await page.evaluate(() => window.__authCaptureProbes?.resetStability?.());
    await page.evaluate(() => window.__sayittomeNavCapture?.begin?.("chats-to-shuffle"));

    try {
      await humanClickNavTab(page, "shuffle");
    } catch (error) {
      timeline.push({ kind: "leg2-shuffle-click-failed", error: String(error) });
    }
    await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
    await waitShuffleStable(page, { minStableFrames: 4, timeoutMs: 20000 }).catch(() => {});
    await page.waitForTimeout(800);

    try {
      await cdp.send("Page.stopScreencast");
    } catch {
      /* ignore */
    }
    cdp.removeListener("Page.screencastFrame", onScreencast2);

    const tracePath = path.join(outDir, "trace.json");
    await stopTracing(cdp, tracePath);

    const navCaptureExport = await page.evaluate(() => window.__sayittomeNavCapture?.export?.() ?? null);
    const probeExport = await page.evaluate(() => window.__authCaptureProbes?.exportAll?.() ?? null);

    const leg1 = frames.filter((f) => f.leg === "shuffle-to-chats");
    const leg2 = frames.filter((f) => f.leg === "chats-to-shuffle");
    const suspects = leg2.filter((f) => f.isSuspectGhost);

    const frameX = suspects[0] ?? leg2.find((f) => f.classification !== "SHUFFLE_VALID") ?? null;
    if (frameX) {
      const framePath = path.join(leg2Dir, `frame-${String(frameX.index).padStart(2, "0")}.png`);
      if (fs.existsSync(framePath)) {
        fs.copyFileSync(framePath, path.join(outDir, "frame-X.png"));
      }
    }

    const handoffPendingFrames = leg2.filter(
      (f) =>
        f.geometry?.htmlClasses?.includes("sayittome-shuffle-handoff-pending") ||
        f.geometry?.validate?.handoff?.shuffleHandoffPending,
    );
    const handoffPendingMs =
      handoffPendingFrames.length > 1
        ? (handoffPendingFrames.at(-1)?.framePresentedAtMono ?? 0) -
          (handoffPendingFrames[0]?.framePresentedAtMono ?? 0)
        : null;

    const metrics = {
      loadingPixelFrameCount: leg2.filter((f) => f.classification === "LOADING").length,
      blackFrameCount: leg2.filter((f) => f.classification === "BLACK_OR_ROOT").length,
      partialShuffleFrameCount: leg2.filter((f) => f.classification === "PARTIAL_SHUFFLE").length,
      architecturalTransientFrameCount: suspects.length,
      sourceMutatedFrameCount: leg2.filter((f) => f.classification === "SOURCE_MUTATED_GHOST").length,
      routeMismatchFrameCount: leg2.filter((f) => f.geometry?.routePresentationMismatch).length,
      handoffPendingFrameCount: handoffPendingFrames.length,
      handoffPendingDurationMs: handoffPendingMs,
    };

    const report = {
      status: recovery.recovered ? "CAPTURED" : "CAPTURED_FROM_STUCK_OR_PARTIAL",
      base,
      profileDir,
      outDir,
      sessionStart: {
        classification: initialSnap?.classification,
        routePresentationMismatch: initialMismatch,
        pathnameRouteSurface: initialSnap?.pathnameRouteSurface,
        actualPresentedSurface: initialSnap?.actualPresentedSurface,
        handoff: initialHandoff,
        chats: initialSnap?.chats,
        modalDismiss,
      },
      shuffleRecovery: recovery,
      session: validation.probe,
      refChatsGeom,
      refShuffleGeom,
      timeline,
      metrics,
      leg1: {
        frames: leg1.length,
        structuralTransients: leg1.filter((f) => f.isSuspectGhost).length,
        classifications: leg1.map((f) => ({ i: f.index, cls: f.classification, ak: f.classificationAK })),
      },
      leg2: {
        frames: leg2.length,
        structuralTransients: suspects.length,
        classifications: leg2.map((f) => ({
          i: f.index,
          cls: f.classification,
          ak: f.classificationAK,
          framePresentedAtMono: f.framePresentedAtMono,
          domSampleAfterDeltaMs: f.domSampleAfterDeltaMs,
          ringBeforeDeltaMs: f.domCorrelation?.ringBeforeDeltaMs,
          ringAfterDeltaMs: f.domCorrelation?.ringAfterDeltaMs,
          sourceMutated: f.sourceMutated,
          pathnameRouteSurface: f.geometry?.pathnameRouteSurface,
          actualPresentedSurface: f.geometry?.actualPresentedSurface,
          routePresentationMismatch: f.geometry?.routePresentationMismatch,
          handoffPending: f.geometry?.validate?.handoff?.shuffleHandoffPending,
        })),
      },
      frameX: frameX
        ? {
            index: frameX.index,
            classification: frameX.classification,
            classificationAK: frameX.classificationAK,
            literalDescription: describeFrameX(frameX),
            framePresentedAtMono: frameX.framePresentedAtMono,
            domSampleAfterDeltaMs: frameX.domSampleAfterDeltaMs,
            domCorrelation: frameX.domCorrelation,
            geometry: frameX.geometry,
            file: "frame-X.png",
          }
        : null,
      handoffAnalysis: {
        expectedCompletion: "observeShuffleGeometryStability() → activateShuffleTabSurface() → clearShuffleHandoffPendingDom()",
        stuckIf: "geometry gate never stable while prep host visibility:hidden opacity:0 (frozen keep-alive)",
        initialHandoffPending: initialHandoff?.shuffleHandoffPending ?? null,
        handoffPendingDurationMs: handoffPendingMs,
        handoffPendingFrameCount: handoffPendingFrames.length,
      },
      loadingNodesObserved: probeExport?.loadingNodes ?? [],
      mutationTimeline: probeExport?.mutations ?? [],
      navCaptureExport,
      probeExport,
      tracePath: fs.existsSync(tracePath) ? tracePath : null,
    };

    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const crash = { status: "CRASH", error: String(error), outDir, timeline };
    fs.writeFileSync(path.join(outDir, "crash.json"), JSON.stringify(crash, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

async function main() {
  if (modeLogin) return runLogin();
  if (modeValidate) return runValidate();
  if (modeCapture) return runCapture();
  console.error("Usage: --login | --validate | --capture [--diag] [--base URL] [--profile DIR] [--out DIR]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
