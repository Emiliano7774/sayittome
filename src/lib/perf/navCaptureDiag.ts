/**
 * Optional navigation capture diagnostics — OFF by default.
 * Enable: ?navcapture=1 or localStorage sayittome:nav-capture=1
 * Overlay: additionally ?navdiag=1 or localStorage sayittome:nav-diag=1
 */

import { getAtomicVisualHandoffPhase } from "@/lib/navigation/atomicVisualHandoff";
import {
  exportMainTabHandoffState,
  getAtomicMainTabHandoffVersion,
} from "@/lib/navigation/atomicMainTabHandoff";
import {
  getShuffleDeferSourcePath,
  isShuffleExitToMainTabPending,
  isShuffleRevealDeferred,
  isShuffleSurfacePresented,
} from "@/lib/navigation/shuffleHandoffState";
import { isShuffleHandoffPreparing } from "@/lib/shuffle/shuffleWarmVisual";

export type NavCapturePhase =
  | "IDLE"
  | "PREPARING_SHUFFLE"
  | "SHUFFLE_GEOMETRY_WAIT"
  | "SWAPPING_SHUFFLE"
  | "SHUFFLE_PRESENTED"
  | "PREPARING_MAIN_TAB"
  | "MAIN_TAB_HANDOFF"
  | "SHUFFLE_EXIT"
  | "UNKNOWN";

export type NavCaptureSurface =
  | "NONE"
  | "SHUFFLE"
  | "CHATS"
  | "STORIES"
  | "BOOST"
  | "SETTINGS"
  | "OTHER";

export type NavCaptureEvent = {
  monoMs: number;
  kind: string;
  navSeq: number;
  phase: NavCapturePhase;
  surface: NavCaptureSurface;
  detail?: string;
  pathname?: string;
};

export type NavCaptureDomSnapshot = {
  monoMs: number;
  pathname: string;
  htmlClasses: string[];
  bodyClasses: string[];
  shuffle: Record<string, unknown> | null;
  chats: Record<string, unknown> | null;
  handoff: Record<string, unknown>;
};

export type SessionProbeResult = {
  valid: boolean;
  reason?: string;
  authUid?: string | null;
  isAnonymous?: boolean;
  username?: string | null;
  authLoading?: boolean;
  pathname?: string;
  shuffleSlots?: number;
  shuffleVisible?: boolean;
  chatsHydrated?: boolean;
  chatsRows?: number;
  blockingModals?: string[];
};

let navSeq = 0;
let phase: NavCapturePhase = "IDLE";
let surface: NavCaptureSurface = "NONE";
const events: NavCaptureEvent[] = [];
const domRing: NavCaptureDomSnapshot[] = [];
const DOM_RING_MAX = 240;

let sessionProbeFn: (() => SessionProbeResult) | null = null;
let rafLoopId: number | null = null;
let listeners = new Set<() => void>();

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function isNavCaptureEnabled() {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("navcapture=1")) return true;
  if (window.localStorage.getItem("sayittome:nav-capture") === "1") return true;
  // SoftNavigate remounts drop ?navcapture=1; keep probe attach alive for the
  // same tab session so __microSlideActivationExport stays readable mid-hop.
  try {
    if (window.sessionStorage.getItem("sayittome:nav-capture-session") === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return process.env.NEXT_PUBLIC_NAV_CAPTURE === "1";
}

export function isNavDiagOverlayEnabled() {
  if (typeof window === "undefined") return false;
  if (!isNavCaptureEnabled()) return false;
  if (window.location.search.includes("navdiag=1")) return true;
  return window.localStorage.getItem("sayittome:nav-diag") === "1";
}

export function subscribeNavCaptureDiag(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNavCaptureVersion() {
  return navSeq + events.length + domRing.length;
}

export function getNavCaptureState() {
  return { navSeq, phase, surface };
}

export function registerSessionProbe(fn: () => SessionProbeResult) {
  sessionProbeFn = fn;
}

export function readSessionProbe(): SessionProbeResult {
  if (!sessionProbeFn) {
    return { valid: false, reason: "session-probe-not-registered" };
  }
  return sessionProbeFn();
}

function surfaceFromPath(pathname: string): NavCaptureSurface {
  const path = pathname.split("?")[0].split("#")[0];
  if (path === "/shuffle") return "SHUFFLE";
  if (path === "/chats") return "CHATS";
  if (path === "/stories") return "STORIES";
  if (path === "/boost") return "BOOST";
  if (path === "/settings") return "SETTINGS";
  return "OTHER";
}

function inferPresentedSurface(pathname: string): NavCaptureSurface {
  if (typeof document === "undefined") return surfaceFromPath(pathname);

  const shuffle = document.getElementById("sayittome-shuffle-keepalive-host");
  if (shuffle?.classList.contains("sayittome-shuffle-keepalive-visible")) {
    return "SHUFFLE";
  }

  for (const key of ["chats", "stories", "boost", "settings"] as const) {
    const host = document.getElementById(`sayittome-main-tab-keepalive-${key}`);
    if (host?.classList.contains("sayittome-main-tab-keepalive-visible")) {
      return key.toUpperCase() as NavCaptureSurface;
    }
  }

  return surfaceFromPath(pathname);
}

function panelSnapshot(id: string) {
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    visible: el.classList.contains(id.includes("shuffle") ? "sayittome-shuffle-keepalive-visible" : "sayittome-main-tab-keepalive-visible"),
    frozen: el.classList.contains(id.includes("shuffle") ? "sayittome-shuffle-keepalive-frozen" : "sayittome-main-tab-keepalive-frozen"),
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    zIndex: cs.zIndex,
    rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
  };
}

export function sampleNavCaptureDom(): NavCaptureDomSnapshot {
  const pathname = typeof location !== "undefined" ? location.pathname : "";
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const slots =
    shuffleHost?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)")
      .length ?? 0;

  return {
    monoMs: monoMs(),
    pathname,
    htmlClasses: [...document.documentElement.classList].filter((c) => c.startsWith("sayittome-")),
    bodyClasses: [...document.body.classList].filter((c) => c.startsWith("sayittome-")),
    shuffle: shuffleHost
      ? {
          ...panelSnapshot("sayittome-shuffle-keepalive-host"),
          slots,
        }
      : null,
    chats: panelSnapshot("sayittome-main-tab-keepalive-chats"),
    handoff: {
      atomicVisual: getAtomicVisualHandoffPhase(),
      shuffleRevealDeferred: isShuffleRevealDeferred(),
      shuffleDeferSource: getShuffleDeferSourcePath(),
      shuffleSurfacePresented: isShuffleSurfacePresented(),
      shuffleExitPending: isShuffleExitToMainTabPending(),
      shuffleHandoffPreparing: isShuffleHandoffPreparing(),
      mainTab: exportMainTabHandoffState(pathname),
      mainTabVersion: getAtomicMainTabHandoffVersion(),
      htmlHandoffPending: document.documentElement.classList.contains("sayittome-shuffle-handoff-pending"),
      htmlShuffleExit: document.documentElement.classList.contains("sayittome-shuffle-exit-handoff-pending"),
      htmlMainTabHandoff: document.documentElement.classList.contains("sayittome-main-tab-handoff-pending"),
    },
  };
}

function pushDomRing() {
  if (!isNavCaptureEnabled() || typeof document === "undefined") return;
  domRing.push(sampleNavCaptureDom());
  if (domRing.length > DOM_RING_MAX) domRing.shift();
}

function pushEvent(kind: string, detail?: string) {
  if (!isNavCaptureEnabled()) return;
  const pathname = typeof location !== "undefined" ? location.pathname : undefined;
  events.push({
    monoMs: monoMs(),
    kind,
    navSeq,
    phase,
    surface,
    detail,
    pathname,
  });
  if (events.length > 600) events.splice(0, events.length - 600);
}

export function beginNavCaptureSequence(label: string) {
  if (!isNavCaptureEnabled()) return;
  navSeq += 1;
  pushEvent("sequence-begin", label);
  notify();
}

export function setNavCapturePhase(next: NavCapturePhase, detail?: string) {
  if (!isNavCaptureEnabled()) return;
  phase = next;
  pushEvent("phase", detail ?? next);
  notify();
}

export function setNavCaptureSurface(next: NavCaptureSurface, detail?: string) {
  if (!isNavCaptureEnabled()) return;
  surface = next;
  pushEvent("surface", detail ?? next);
  notify();
}

export function markNavCaptureDetail(kind: string, detail?: string) {
  pushEvent(kind, detail);
}

export function syncNavCaptureFromDom(pathname: string) {
  if (!isNavCaptureEnabled()) return;
  surface = inferPresentedSurface(pathname);
}

export function nearestDomSnapshots(targetMonoMs: number) {
  if (!domRing.length) return { before: null, after: null, beforeDeltaMs: null, afterDeltaMs: null };
  let before: NavCaptureDomSnapshot | null = null;
  let after: NavCaptureDomSnapshot | null = null;
  for (const snap of domRing) {
    if (snap.monoMs <= targetMonoMs) before = snap;
    if (snap.monoMs >= targetMonoMs && !after) after = snap;
  }
  return {
    before,
    after,
    beforeDeltaMs: before ? targetMonoMs - before.monoMs : null,
    afterDeltaMs: after ? after.monoMs - targetMonoMs : null,
  };
}

export function exportNavCaptureDiag() {
  return {
    navSeq,
    phase,
    surface,
    events: [...events],
    domRing: [...domRing],
    session: readSessionProbe(),
  };
}

export function resetNavCaptureDiag() {
  navSeq = 0;
  phase = "IDLE";
  surface = "NONE";
  events.length = 0;
  domRing.length = 0;
}

function installPointerHooks() {
  if (typeof window === "undefined" || !isNavCaptureEnabled()) return;

  const onPointer = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const tab = target?.closest("[data-nav-tab]")?.getAttribute("data-nav-tab");
    pushEvent("pointer", `${event.type}${tab ? `:${tab}` : ""}`);
  };

  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("pointerup", onPointer, true);
  window.addEventListener("click", onPointer, true);
}

function installNavigationHooks() {
  if (typeof window === "undefined" || !isNavCaptureEnabled()) return;

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    pushEvent("history-pushState", String(args[2] ?? ""));
    return originalPushState(...args);
  };
  history.replaceState = (...args) => {
    pushEvent("history-replaceState", String(args[2] ?? ""));
    return originalReplaceState(...args);
  };
  window.addEventListener("popstate", () => pushEvent("popstate", location.pathname), true);
}

function startDomRingLoop() {
  if (rafLoopId != null || typeof window === "undefined" || !isNavCaptureEnabled()) return;

  const loop = () => {
    pushDomRing();
    rafLoopId = requestAnimationFrame(loop);
  };
  rafLoopId = requestAnimationFrame(loop);
}

export function attachNavCaptureDiag() {
  if (typeof window === "undefined" || !isNavCaptureEnabled()) return;
  installPointerHooks();
  installNavigationHooks();
  startDomRingLoop();
  pushEvent("attach");
}

declare global {
  interface Window {
    __sayittomeNavCapture?: {
      enabled: boolean;
      overlay: boolean;
      begin: typeof beginNavCaptureSequence;
      mark: typeof markNavCaptureDetail;
      setPhase: typeof setNavCapturePhase;
      setSurface: typeof setNavCaptureSurface;
      sampleDom: typeof sampleNavCaptureDom;
      nearestDom: typeof nearestDomSnapshots;
      export: typeof exportNavCaptureDiag;
      reset: typeof resetNavCaptureDiag;
      session: typeof readSessionProbe;
      state: typeof getNavCaptureState;
    };
    __sayittomeSessionProbe?: () => SessionProbeResult;
  }
}

if (typeof window !== "undefined") {
  window.__sayittomeNavCapture = {
    enabled: isNavCaptureEnabled(),
    overlay: isNavDiagOverlayEnabled(),
    begin: beginNavCaptureSequence,
    mark: markNavCaptureDetail,
    setPhase: setNavCapturePhase,
    setSurface: setNavCaptureSurface,
    sampleDom: sampleNavCaptureDom,
    nearestDom: nearestDomSnapshots,
    export: exportNavCaptureDiag,
    reset: resetNavCaptureDiag,
    session: readSessionProbe,
    state: getNavCaptureState,
  };
  window.__sayittomeSessionProbe = readSessionProbe;
}
