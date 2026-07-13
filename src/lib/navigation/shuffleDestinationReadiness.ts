/**
 * DOM readiness for Shuffle destination before micro-slide presentation.
 * Uses layout metrics on the hidden prep surface — not warm/cold booleans.
 *
 * Post-settle handoff uses `final_route` target: pathname /shuffle + visible keep-alive surface.
 */

import {
  isFinalDomReadinessJitterBlocking,
  markShuffleRouteCommittedNow,
  resetShuffleRouteCommittedMarker,
} from "@/lib/navigation/postSettleBridgeDiagJitter";
import { getShufflePoolWarmState } from "@/lib/shuffle/shufflePoolWarmup";
import { sampleShuffleHandoffGeometry, type ShuffleGeometrySample } from "@/lib/shuffle/shuffleWarmVisual";

const LOADING_TEXT_RE = /^(Cargando\.\.\.|Loading\.\.\.|Caricamento\.\.\.|Laden\.\.\.)$/i;
const RECT_TOLERANCE = 4;
const MIN_SLOT_W = 2;
const MIN_SLOT_H = 2;
const MIN_FEED_W = 2;
const MIN_FEED_H = 48;

export type ShuffleReadinessTarget = "prep" | "final_route";

export type ShuffleDestinationReadiness = {
  ready: boolean;
  reason?: string;
  sample: ShuffleGeometrySample | null;
  loadingShellCount: number;
  domSlots: number;
  visibleSlots: number;
  firstSlotKey: string;
  hostMounted?: boolean;
  hostVisible?: boolean;
  pathname?: string;
  readinessTarget?: ShuffleReadinessTarget;
};

export type FinalShuffleRoutePresentationReadiness = ShuffleDestinationReadiness & {
  readinessTarget: "final_route";
  finalSurfaceMounted: boolean;
  finalSurfaceVisible: boolean;
  finalSurfaceDomSlots: number;
  finalSurfaceVisibleSlots: number;
  finalSurfaceLoadingShellVisible: boolean;
};

function shufflePathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function isElementPresentable(el: HTMLElement) {
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.04) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function countVisibleSlotsWithRects(feed: ParentNode) {
  const slots = [...feed.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")];
  let visible = 0;
  for (const slot of slots) {
    const el = slot as HTMLElement;
    const rect = el.getBoundingClientRect();
    const w = Math.max(el.offsetWidth, Math.round(rect.width));
    const h = Math.max(el.offsetHeight, Math.round(rect.height));
    if (w > MIN_SLOT_W && h > MIN_SLOT_H) visible += 1;
  }
  return { slots, visible };
}

function countVisibleLoadingShells(host: ParentNode | null) {
  if (!host) return 0;
  let count = 0;
  for (const shell of host.querySelectorAll("[data-loading-shell]")) {
    const el = shell as HTMLElement;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.04) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    count += 1;
  }
  return count;
}

function hasVisibleLoadingText(host: ParentNode | null) {
  if (!host) return false;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim() ?? "";
    if (!LOADING_TEXT_RE.test(text)) {
      node = walker.nextNode();
      continue;
    }
    const el = node.parentElement;
    if (!el) {
      node = walker.nextNode();
      continue;
    }
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.04) {
      node = walker.nextNode();
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) return true;
    node = walker.nextNode();
  }
  return false;
}

function evaluateSurfacePresentationReadiness(
  surface: ParentNode | null,
  extras?: Partial<ShuffleDestinationReadiness>,
): ShuffleDestinationReadiness {
  if (!surface) {
    return {
      ready: false,
      reason: "surface-missing",
      sample: null,
      loadingShellCount: 0,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      ...extras,
    };
  }

  const loadingShellCount = countVisibleLoadingShells(surface);
  if (loadingShellCount > 0) {
    return {
      ready: false,
      reason: "loading-shell",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      ...extras,
    };
  }

  if (hasVisibleLoadingText(surface)) {
    return {
      ready: false,
      reason: "loading-text",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      ...extras,
    };
  }

  const feed = surface.querySelector("[data-shuffle-list]");
  if (!feed) {
    return {
      ready: false,
      reason: "no-feed-list",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      ...extras,
    };
  }

  const { slots, visible } = countVisibleSlotsWithRects(feed);
  if (slots.length < 3) {
    return {
      ready: false,
      reason: "domSlots<3",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount,
      domSlots: slots.length,
      visibleSlots: visible,
      firstSlotKey: "",
      ...extras,
    };
  }

  for (const slot of slots.slice(0, 3)) {
    const el = slot as HTMLElement;
    if (el.offsetWidth <= MIN_SLOT_W || el.offsetHeight <= MIN_SLOT_H) {
      return {
        ready: false,
        reason: "slot-geometry",
        sample: sampleShuffleHandoffGeometry(),
        loadingShellCount,
        domSlots: slots.length,
        visibleSlots: visible,
        firstSlotKey: "",
        ...extras,
      };
    }
  }

  const feedEl = feed as HTMLElement;
  const feedRect = feedEl.getBoundingClientRect();
  const feedW = Math.max(feedEl.offsetWidth, Math.round(feedRect.width));
  const feedH = Math.max(feedEl.offsetHeight, Math.round(feedRect.height));
  if (feedW <= MIN_FEED_W || feedH < MIN_FEED_H) {
    return {
      ready: false,
      reason: "feed-geometry",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount,
      domSlots: slots.length,
      visibleSlots: visible,
      firstSlotKey: "",
      ...extras,
    };
  }

  const first = slots[0] as HTMLElement;
  const firstSlotKey =
    first.getAttribute("data-username") ||
    first.getAttribute("data-profile-uid") ||
    first.getAttribute("data-slot-index") ||
    `slot-0-${first.textContent?.slice(0, 12) ?? "anon"}`;

  const sample = sampleShuffleHandoffGeometry();
  return {
    ready: true,
    sample,
    loadingShellCount: 0,
    domSlots: slots.length,
    visibleSlots: visible,
    firstSlotKey,
    ...extras,
  };
}

function resolvePrepSurfaceRoot() {
  if (typeof document === "undefined") return null;
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return null;
  return host.querySelector(".sayittome-shuffle-surface-prep") ?? host;
}

/** Prep host surface — used before slide and during post-settle bridge while pathname may still be source tab. */
function evaluatePrepShuffleDestinationReadiness(): ShuffleDestinationReadiness {
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) {
    return {
      ready: false,
      reason: "host-missing",
      sample: null,
      loadingShellCount: 0,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      hostMounted: false,
      hostVisible: false,
      readinessTarget: "prep",
    };
  }

  const prep = resolvePrepSurfaceRoot();
  return evaluateSurfacePresentationReadiness(prep, {
    hostMounted: true,
    hostVisible: isElementPresentable(host),
    readinessTarget: "prep",
  });
}

function resolveFinalShuffleRouteSurfaceRoot() {
  if (typeof document === "undefined") return null;
  const pathname = shufflePathnameNow();
  if (pathname !== "/shuffle") return null;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return null;

  const bridgeActive = document.documentElement.hasAttribute("data-post-settle-route-bridge");
  const hostVisibleClass = host.classList.contains("sayittome-shuffle-keepalive-visible");
  if (!hostVisibleClass && !bridgeActive) return null;

  const prep = host.querySelector(".sayittome-shuffle-surface-prep") as HTMLElement | null;
  if (!prep) return null;
  if (!bridgeActive && !isElementPresentable(host)) return null;
  if (!isElementPresentable(prep) && !bridgeActive) return null;
  return prep;
}

/** Final /shuffle route surface — requires committed pathname and visible keep-alive host. */
export function evaluateFinalShuffleRoutePresentationReadiness(): FinalShuffleRoutePresentationReadiness {
  const pathname = shufflePathnameNow();
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  const hostMounted = Boolean(host);
  const hostVisible = host ? isElementPresentable(host) : false;
  const surface = resolveFinalShuffleRouteSurfaceRoot();

  if (pathname === "/shuffle") {
    markShuffleRouteCommittedNow();
  }

  if (pathname !== "/shuffle") {
    resetShuffleRouteCommittedMarker();
  }

  if (pathname !== "/shuffle") {
    return {
      ready: false,
      reason: "pathname-not-shuffle",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount: 0,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      pathname,
      readinessTarget: "final_route",
      hostMounted,
      hostVisible,
      finalSurfaceMounted: false,
      finalSurfaceVisible: false,
      finalSurfaceDomSlots: 0,
      finalSurfaceVisibleSlots: 0,
      finalSurfaceLoadingShellVisible: false,
    };
  }

  if (!surface) {
    return {
      ready: false,
      reason: hostMounted ? "final-surface-not-presentable" : "host-missing",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount: 0,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      pathname,
      readinessTarget: "final_route",
      hostMounted,
      hostVisible,
      finalSurfaceMounted: false,
      finalSurfaceVisible: false,
      finalSurfaceDomSlots: 0,
      finalSurfaceVisibleSlots: 0,
      finalSurfaceLoadingShellVisible: false,
    };
  }

  if (isFinalDomReadinessJitterBlocking()) {
    return {
      ready: false,
      reason: "diag-final-dom-jitter",
      sample: sampleShuffleHandoffGeometry(),
      loadingShellCount: 0,
      domSlots: 0,
      visibleSlots: 0,
      firstSlotKey: "",
      pathname,
      readinessTarget: "final_route",
      hostMounted: true,
      hostVisible: true,
      finalSurfaceMounted: true,
      finalSurfaceVisible: true,
      finalSurfaceDomSlots: 0,
      finalSurfaceVisibleSlots: 0,
      finalSurfaceLoadingShellVisible: false,
    };
  }

  const base = evaluateSurfacePresentationReadiness(surface, {
    pathname,
    readinessTarget: "final_route",
    hostMounted,
    hostVisible,
  });

  const loadingShellCount = countVisibleLoadingShells(surface);
  return {
    ...base,
    readinessTarget: "final_route",
    finalSurfaceMounted: true,
    finalSurfaceVisible: true,
    finalSurfaceDomSlots: base.domSlots,
    finalSurfaceVisibleSlots: base.visibleSlots,
    finalSurfaceLoadingShellVisible: loadingShellCount > 0,
  };
}

export function isFinalShuffleRoutePresentationReady() {
  return evaluateFinalShuffleRoutePresentationReadiness().ready;
}

function evaluateShuffleDestinationReadiness(): ShuffleDestinationReadiness {
  return evaluatePrepShuffleDestinationReadiness();
}

export function isShuffleDestinationDomReadyForPresentation() {
  return evaluateShuffleDestinationReadiness().ready;
}

export function getShuffleDestinationReadiness() {
  return evaluateShuffleDestinationReadiness();
}

export function getFinalShuffleRoutePresentationReadiness() {
  return evaluateFinalShuffleRoutePresentationReadiness();
}

export type ShuffleDestinationVisualReadiness = {
  ready: boolean;
  hasLoadingShell: boolean;
  showShuffleLoading: boolean;
  hasShuffleList: boolean;
  slotCount: number;
  geometryValid: boolean;
  loadingTextVisibleInDestination: boolean;
  poolWarmState: "ready" | "warming" | "empty" | "unknown";
  reason: string;
};

/**
 * Live destination visual readiness for the no-loading mid-slide contract.
 * Prefer prep surface (pre-slide); includes pool warm state.
 */
export function getShuffleDestinationVisualReadiness(): ShuffleDestinationVisualReadiness {
  const base = evaluateShuffleDestinationReadiness();
  const prep = resolvePrepSurfaceRoot();
  const hasLoadingShell = countVisibleLoadingShells(prep) > 0;
  const loadingTextVisibleInDestination = hasVisibleLoadingText(prep);
  const hasShuffleList = Boolean(prep?.querySelector("[data-shuffle-list]"));
  const slotCount = base.domSlots;
  const geometryValid =
    base.ready ||
    (base.reason !== "slot-geometry" &&
      base.reason !== "feed-geometry" &&
      base.reason !== "surface-missing" &&
      base.reason !== "host-missing" &&
      slotCount >= 3 &&
      !hasLoadingShell &&
      !loadingTextVisibleInDestination &&
      hasShuffleList);

  let poolWarmState: ShuffleDestinationVisualReadiness["poolWarmState"] = "unknown";
  try {
    poolWarmState = getShufflePoolWarmState();
  } catch {
    poolWarmState = "unknown";
  }

  const showShuffleLoading = hasLoadingShell || loadingTextVisibleInDestination;
  const ready =
    base.ready &&
    !hasLoadingShell &&
    !loadingTextVisibleInDestination &&
    hasShuffleList &&
    slotCount >= 3 &&
    poolWarmState !== "empty";

  let reason = base.reason || (ready ? "ready" : "not-ready");
  if (hasLoadingShell) reason = "loading-shell";
  else if (loadingTextVisibleInDestination) reason = "loading-text";
  else if (!hasShuffleList) reason = "no-feed-list";
  else if (slotCount < 3) reason = "domSlots<3";
  else if (poolWarmState === "warming") reason = "pool-warming";
  else if (poolWarmState === "empty") reason = "pool-empty";

  return {
    ready,
    hasLoadingShell,
    showShuffleLoading,
    hasShuffleList,
    slotCount,
    geometryValid: ready || geometryValid,
    loadingTextVisibleInDestination,
    poolWarmState,
    reason,
  };
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__sayittomeGetShuffleDestinationVisualReadiness =
    getShuffleDestinationVisualReadiness;
}

let stableReadinessStreak = 0;
let lastStableSample: ShuffleGeometrySample | null = null;

let finalStableReadinessStreak = 0;
let lastFinalStableSample: ShuffleGeometrySample | null = null;

export function resetShuffleDestinationReadinessStability() {
  stableReadinessStreak = 0;
  lastStableSample = null;
}

export function resetFinalShuffleRoutePresentationReadinessStability() {
  finalStableReadinessStreak = 0;
  lastFinalStableSample = null;
}

function samplesStable(a: ShuffleGeometrySample | null, b: ShuffleGeometrySample | null) {
  if (!a || !b) return false;
  if (a.prepDomSlots < 3 || b.prepDomSlots < 3) return false;
  if (a.firstSlotKey !== b.firstSlotKey) return false;
  if (a.scrollTop !== b.scrollTop) return false;
  const ar = a.firstSlotRect;
  const br = b.firstSlotRect;
  if (!ar || !br) return false;
  if (
    Math.abs(ar.x - br.x) > RECT_TOLERANCE ||
    Math.abs(ar.y - br.y) > RECT_TOLERANCE ||
    Math.abs(ar.w - br.w) > RECT_TOLERANCE ||
    Math.abs(ar.h - br.h) > RECT_TOLERANCE
  ) {
    return false;
  }
  const af = a.feedRect;
  const bf = b.feedRect;
  if (!af || !bf) return false;
  if (Math.abs(af.w - bf.w) > RECT_TOLERANCE || Math.abs(af.h - bf.h) > RECT_TOLERANCE) {
    return false;
  }
  return true;
}

/** Two consecutive rAF-stable feed-ready observations on prep surface. */
export function observeShuffleDestinationReadinessStable(): boolean {
  const current = evaluateShuffleDestinationReadiness();
  if (!current.ready || !current.sample) {
    stableReadinessStreak = 0;
    lastStableSample = null;
    return false;
  }

  if (samplesStable(lastStableSample, current.sample)) {
    stableReadinessStreak += 1;
  } else {
    stableReadinessStreak = 1;
  }

  lastStableSample = current.sample;
  return stableReadinessStreak >= 2;
}

/** Two consecutive rAF-stable observations on definitive /shuffle route surface. */
export function observeFinalShuffleRoutePresentationReadinessStable(): boolean {
  const current = evaluateFinalShuffleRoutePresentationReadiness();
  if (!current.ready || !current.sample) {
    finalStableReadinessStreak = 0;
    lastFinalStableSample = null;
    return false;
  }

  if (samplesStable(lastFinalStableSample, current.sample)) {
    finalStableReadinessStreak += 1;
  } else {
    finalStableReadinessStreak = 1;
  }

  lastFinalStableSample = current.sample;
  return finalStableReadinessStreak >= 2;
}
