import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { isShuffleRevealDeferred } from "@/lib/navigation/shuffleHandoffState";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import {
  hasShuffleWarmVisualReady,
  peekPinnedShuffleWindowCount,
  restorePinnedShuffleWindowSync,
} from "@/lib/shuffle/shufflePinnedWindow";

function isWarmShuffleKeepAliveMounted() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("sayittome-shuffle-keepalive-host"));
}

export function isShuffleKeepAliveHostMounted() {
  return isWarmShuffleKeepAliveMounted();
}

let shuffleHandoffPreparing = false;

export function setShuffleHandoffPreparing(value: boolean) {
  shuffleHandoffPreparing = value;
}

export function isShuffleHandoffPreparing() {
  return shuffleHandoffPreparing;
}

let warmReturnVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  warmReturnVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleWarmReturn(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShuffleWarmReturnVersion() {
  return warmReturnVersion;
}

/** Synchronous PREPARE before router commits to /shuffle. */
export function prepareShuffleWarmTabReturn() {
  const ready = restorePinnedShuffleWindowSync();
  notify();
  return ready;
}

export function isShuffleWarmVisualReady() {
  return hasShuffleWarmVisualReady();
}

export type ShuffleLoadingGateInput = {
  loading: boolean;
  listReady: boolean;
  visibleCount: number;
};

/** Warm keep-alive / handoff must never paint the cold loading shell. */
export function hasWarmShufflePresentationHint() {
  if (shuffleHandoffPreparing) return true;
  if (isShuffleRevealDeferred()) return true;
  if (getVisibleShuffleProfiles().length >= 3) return true;
  if (peekPinnedShuffleWindowCount() >= 3) return true;
  if (hasShuffleWarmVisualReady()) return true;
  return false;
}

/** Cold-only full-page loader. Warm keep-alive must never paint this shell. */
export function shouldPaintShuffleLoadingShell(input: ShuffleLoadingGateInput) {
  if (isWarmShuffleKeepAliveMounted()) return false;
  if (isShuffleRevealDeferred()) return false;
  if (shuffleHandoffPreparing) return false;
  if (hasWarmShufflePresentationHint()) return false;
  if (hasShuffleEverHydrated()) return false;
  if (input.visibleCount > 0) return false;
  if (input.listReady) return false;
  if (hasShuffleWarmVisualReady()) return false;

  return input.loading;
}

export function shouldPresentWarmShuffleFeed(input: ShuffleLoadingGateInput) {
  if (input.visibleCount > 0 || input.listReady || hasShuffleEverHydrated()) return true;
  return hasWarmShufflePresentationHint();
}

const LOADING_TEXT_RE = /Cargando\.\.\.|Loading\.\.\./i;

export type ShuffleGeometrySample = {
  at: number;
  paintedSlots: number;
  prepDomSlots: number;
  domSlots: number;
  firstSlotKey: string;
  firstSlotRect: { x: number; y: number; w: number; h: number } | null;
  feedRect: { w: number; h: number } | null;
  scrollTop: number;
  loadingShellDom: boolean;
  loadingTextInHost: boolean;
  loadingTextPaths: string[];
  hostClass: string;
  hostVisibility: string;
  hostOpacity: string;
  hostDisplay: string;
  hostContain: string;
  hostZIndex: string;
  hostRect: { w: number; h: number } | null;
  prepVisibility: string;
  prepOpacity: string;
};

function countPrepDomSlots(host: ParentNode) {
  const list = host.querySelector("[data-shuffle-list]");
  if (!list) return 0;
  return list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)").length;
}

function countPaintedShuffleFeedItems(host: ParentNode) {
  return countPrepDomSlots(host);
}

function firstVisibleSlotSummary(host: ParentNode) {
  const list = host.querySelector("[data-shuffle-list]");
  if (!list) return { key: "", rect: null as ShuffleGeometrySample["firstSlotRect"] };

  const slot = list.querySelector(":scope > *:not(.sayittome-nav-scroll-spacer)");
  if (!slot) return { key: "", rect: null };

  const el = slot as HTMLElement;
  const layoutRect = el.getBoundingClientRect();
  const w = Math.max(el.offsetWidth, Math.round(layoutRect.width));
  const h = Math.max(el.offsetHeight, Math.round(layoutRect.height));
  const key =
    slot.getAttribute("data-username") ||
    slot.getAttribute("data-profile-uid") ||
    slot.getAttribute("data-slot-index") ||
    "";

  return {
    key,
    rect: { x: Math.round(layoutRect.x), y: Math.round(layoutRect.y), w, h },
  };
}

function collectLoadingTextPaths(host: ParentNode) {
  const paths: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim() ?? "";
    if (LOADING_TEXT_RE.test(text)) {
      const el = node.parentElement;
      if (el) {
        paths.push(
          `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join(".")}` : ""}`,
        );
      }
    }
    node = walker.nextNode();
  }
  return paths;
}

/** Sample prep-surface geometry from the hidden shuffle host. */
export function sampleShuffleHandoffGeometry(): ShuffleGeometrySample | null {
  if (typeof document === "undefined") return null;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return null;

  const prep = host.querySelector(".sayittome-shuffle-surface-prep") ?? host;
  const scrollRoot = prep.querySelector("main[data-scroll-root]");
  const feed = prep.querySelector("[data-shuffle-list], [data-nav-shuffle-primary]");
  const feedEl = feed as HTMLElement | null;
  const feedRect = feed?.getBoundingClientRect();
  const feedW = Math.max(feedEl?.offsetWidth ?? 0, Math.round(feedRect?.width ?? 0));
  const feedH = Math.max(feedEl?.offsetHeight ?? 0, Math.round(feedRect?.height ?? 0));
  const prepDomSlots = countPrepDomSlots(prep);
  const hostRect = host.getBoundingClientRect();
  const hostStyle = getComputedStyle(host);
  const prepStyle = getComputedStyle(prep);
  const slot = firstVisibleSlotSummary(prep);
  const loadingTextPaths = collectLoadingTextPaths(prep);

  return {
    at: Math.round(performance.now()),
    paintedSlots: prepDomSlots,
    prepDomSlots,
    domSlots: getVisibleShuffleProfiles().length,
    firstSlotKey: slot.key,
    firstSlotRect: slot.rect,
    feedRect: feedW > 0 || feedH > 0 ? { w: feedW, h: feedH } : null,
    scrollTop: scrollRoot?.scrollTop ?? 0,
    loadingShellDom: Boolean(prep.querySelector("[data-loading-shell]")),
    loadingTextInHost: loadingTextPaths.length > 0,
    loadingTextPaths,
    hostClass: host.className,
    hostVisibility: hostStyle.visibility,
    hostOpacity: hostStyle.opacity,
    hostDisplay: hostStyle.display,
    hostContain: hostStyle.contain,
    hostZIndex: hostStyle.zIndex,
    hostRect: { w: Math.round(hostRect.width), h: Math.round(hostRect.height) },
    prepVisibility: prepStyle.visibility,
    prepOpacity: prepStyle.opacity,
  };
}

const RECT_TOLERANCE = 4;
const MIN_FEED_HEIGHT = Math.max(120, Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.18));

function rectNear(
  a: ShuffleGeometrySample["firstSlotRect"],
  b: ShuffleGeometrySample["firstSlotRect"],
) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) <= RECT_TOLERANCE &&
    Math.abs(a.y - b.y) <= RECT_TOLERANCE &&
    Math.abs(a.w - b.w) <= RECT_TOLERANCE &&
    Math.abs(a.h - b.h) <= RECT_TOLERANCE
  );
}

export function isShufflePrepGeometryStable(
  previous: ShuffleGeometrySample | null,
  next: ShuffleGeometrySample | null,
) {
  if (!previous || !next) return false;
  if (next.loadingShellDom && next.prepDomSlots < 3) return false;

  if (next.prepDomSlots < 3) return false;
  if (!next.firstSlotRect || next.firstSlotRect.w < 24 || next.firstSlotRect.h < 24) return false;

  const prepHidden =
    next.hostVisibility === "hidden" ||
    next.prepVisibility === "hidden" ||
    parseFloat(next.hostOpacity) < 0.05;
  const minFeedHeight = prepHidden ? 48 : MIN_FEED_HEIGHT;
  if (!next.feedRect || next.feedRect.h < minFeedHeight) return false;
  if (next.firstSlotKey !== previous.firstSlotKey) return false;
  if (next.scrollTop !== previous.scrollTop) return false;
  if (!rectNear(previous.firstSlotRect, next.firstSlotRect)) return false;
  if (
    previous.feedRect &&
    next.feedRect &&
    Math.abs(previous.feedRect.h - next.feedRect.h) > RECT_TOLERANCE
  ) {
    return false;
  }
  return true;
}

/** @deprecated Use isShufflePrepGeometryStable for warm handoff PREP. */
export function isShuffleGeometrySampleStable(
  previous: ShuffleGeometrySample | null,
  next: ShuffleGeometrySample | null,
) {
  return isShufflePrepGeometryStable(previous, next);
}

let lastGeometrySample: ShuffleGeometrySample | null = null;
let stableGeometrySample: ShuffleGeometrySample | null = null;

export function resetShuffleGeometryStability() {
  lastGeometrySample = null;
  stableGeometrySample = null;
}

/** Requires two consecutive stable geometry observations. */
export function observeShuffleGeometryStability(): boolean {
  const sample = sampleShuffleHandoffGeometry();
  if (!sample) return false;

  const stable = isShufflePrepGeometryStable(lastGeometrySample, sample);
  lastGeometrySample = sample;
  if (stable) {
    stableGeometrySample = sample;
    return true;
  }

  stableGeometrySample = null;
  return false;
}

export function getStableShuffleGeometrySample() {
  return stableGeometrySample;
}

/** True when hidden prep surface has stable DOM/layout geometry (not paint). */
export function isShuffleVisualHandoffReady() {
  return stableGeometrySample !== null;
}

export function canActivateShuffleWarmHandoff() {
  const sample = sampleShuffleHandoffGeometry();
  if (!sample) return false;
  if (sample.prepDomSlots >= 3) return true;
  return sample.domSlots >= 3 && !sample.loadingTextInHost;
}

export function countPaintedShuffleSlots() {
  if (typeof document === "undefined") return 0;
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return 0;
  const prep = host.querySelector(".sayittome-shuffle-surface-prep") ?? host;
  return countPaintedShuffleFeedItems(prep);
}

export type ShuffleVisualCommitTrace = {
  at: number;
  phase: string;
  loadingShell: boolean;
  visibleCount: number;
  listReady: boolean;
  warmReady: boolean;
  textSample: string;
};

const visualCommits: ShuffleVisualCommitTrace[] = [];
let lastLoadingShellTrace: "hidden" | "mounted" | null = null;

export function traceLoadingShellPresentation(
  visible: boolean,
  input: ShuffleLoadingGateInput,
) {
  if (!isNavTraceEnabled()) return;
  const next = visible ? "mounted" : "hidden";
  if (lastLoadingShellTrace === next) return;
  lastLoadingShellTrace = next;
  const event = visible ? "LOADING_SHELL_VISIBLE" : "LOADING_SHELL_HIDDEN";
  console.info(`[shuffle-loading-shell] ${event}`, {
    at: Math.round(performance.now()),
    ...input,
    warmHint: hasWarmShufflePresentationHint(),
  });
}

export function traceShuffleVisualCommit(
  phase: string,
  input: {
    showLoadingShell: boolean;
    visibleCount: number;
    listReady: boolean;
  },
) {
  if (!isNavTraceEnabled() || typeof document === "undefined") return;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  const text = host?.textContent?.slice(0, 120) ?? "";

  visualCommits.push({
    at: Math.round(performance.now()),
    phase,
    loadingShell: input.showLoadingShell,
    visibleCount: input.visibleCount,
    listReady: input.listReady,
    warmReady: hasShuffleWarmVisualReady(),
    textSample: text,
  });

  if (visualCommits.length > 40) {
    visualCommits.splice(0, visualCommits.length - 40);
  }
}

export function exportShuffleVisualCommits() {
  return [...visualCommits];
}

export function resetShuffleVisualCommits() {
  visualCommits.length = 0;
}

if (typeof window !== "undefined" && isNavTraceEnabled()) {
  window.__sayittomeShuffleVisualCommits = {
    export: exportShuffleVisualCommits,
    reset: resetShuffleVisualCommits,
    sampleGeometry: sampleShuffleHandoffGeometry,
  };
}

declare global {
  interface Window {
    __sayittomeShuffleVisualCommits?: {
      export: typeof exportShuffleVisualCommits;
      reset: typeof resetShuffleVisualCommits;
      sampleGeometry?: typeof sampleShuffleHandoffGeometry;
    };
  }
}
