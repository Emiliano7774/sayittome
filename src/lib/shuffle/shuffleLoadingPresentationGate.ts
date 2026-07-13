import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { isShuffleRevealDeferred } from "@/lib/navigation/shuffleHandoffState";
import {
  getMainTabToShufflePhase,
  getMainTabToShufflePresentationLatchNavSeq,
  getMainTabToShuffleTransaction,
  isMainTabToShufflePresentationLatchActive,
  isMainTabToShufflePresentationOwned,
  recordLegacyPresentationBlocked,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import { isShuffleHandoffPreparing } from "@/lib/shuffle/shuffleWarmVisual";
import {
  getShuffleDestinationWarmIntent,
  isShuffleDestinationWarmIntentActive,
} from "@/lib/shuffle/shuffleWarmHopIntent";
import type { ShufflePresentationInput } from "@/lib/shuffle/shufflePresentation";
import {
  countRestorableWarmFeedSlots,
  isTrueColdShuffleEntry,
} from "@/lib/shuffle/shufflePresentation";

export type ShuffleLoadingGateSnapshot = {
  monoMs: number;
  pathname: string;
  navSeq: number | null;
  transactionPhase: string;
  isMainTabToShufflePresentationOwned: boolean;
  presentationLatchActive: boolean;
  presentationLatchNavSeq: number | null;
  showShuffleLoadingRequested: boolean;
  mayPresentShuffleLoading: boolean;
  trueCold: boolean;
  warm: boolean;
  restorableSlots: number;
  poolLoading: boolean;
  poolListReady: boolean;
  visibleCount: number;
  hasShuffleEverHydrated: boolean;
  isShuffleRevealDeferred: boolean;
  isShuffleHandoffPreparing: boolean;
  warmHopIntentActive: boolean;
  warmHopIntent: ReturnType<typeof getShuffleDestinationWarmIntent>;
  blockReason: string;
};

export type LegacyLoadingDiagEvent = {
  kind:
    | "LEGACY_LOADING_DECISION"
    | "LEGACY_LOADING_RENDER_COMMIT"
    | "LEGACY_LOADING_BECAME_VISIBLE"
    | "LEGACY_LOADING_ACTUALLY_VISIBLE"
    | "LEGACY_LOADING_BLOCKED_BY_SLIDE_OWNER"
    | "SLIDE_OWNER_STATE_AT_LOADING_COMMIT";
  monoMs: number;
  pathname: string;
  navSeq: number | null;
  transactionPhase: string;
  isMainTabToShufflePresentationOwned: boolean;
  presentationLatchActive: boolean;
  showShuffleLoading: boolean;
  mayPresentShuffleLoading: boolean;
  trueCold: boolean;
  warm: boolean;
  restorableSlots: number;
  domSlots: number;
  blockReason?: string;
  caller?: string;
};

const DIAG_RING_MAX = 96;
const legacyLoadingDiagRing: LegacyLoadingDiagEvent[] = [];

let legacyLoadingAttempted = 0;
let legacyLoadingBlocked = 0;
let legacyLoadingRenderCommits = 0;
let legacyLoadingActuallyVisible = 0;
let lastRenderCommitSignature = "";
let lastActuallyVisibleSignature = "";

function countActuallyVisibleLoadingShells() {
  if (typeof document === "undefined") return 0;
  const prep = document
    .getElementById("sayittome-shuffle-keepalive-host")
    ?.querySelector(".sayittome-shuffle-surface-prep");
  const shells = prep?.querySelectorAll("[data-loading-shell]") ?? [];
  let visible = 0;
  for (const shell of shells) {
    const cs = getComputedStyle(shell);
    const rect = shell.getBoundingClientRect();
    if (
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      parseFloat(cs.opacity) >= 0.04 &&
      rect.width > 1 &&
      rect.height > 1
    ) {
      visible += 1;
    }
  }
  return visible;
}

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function isShuffleKeepAliveSurfaceVisible() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document
      .getElementById("sayittome-shuffle-keepalive-host")
      ?.classList.contains("sayittome-shuffle-keepalive-visible"),
  );
}

function pushLegacyLoadingDiag(event: LegacyLoadingDiagEvent) {
  legacyLoadingDiagRing.push(event);
  if (legacyLoadingDiagRing.length > DIAG_RING_MAX) legacyLoadingDiagRing.shift();
}

export function exportLegacyLoadingDiagRing() {
  return [...legacyLoadingDiagRing];
}

export function exportLegacyLoadingGateCounters() {
  return {
    legacyLoadingRequested: legacyLoadingAttempted,
    legacyLoadingBlocked,
    legacyLoadingRenderCommits,
    legacyLoadingActuallyVisible,
    /** @deprecated use legacyLoadingRenderCommits */
    legacyLoadingVisibleCommits: legacyLoadingRenderCommits,
    legacyLoadingAttempted,
  };
}

export function resetLegacyLoadingGateCounters() {
  legacyLoadingAttempted = 0;
  legacyLoadingBlocked = 0;
  legacyLoadingRenderCommits = 0;
  legacyLoadingActuallyVisible = 0;
  lastRenderCommitSignature = "";
  lastActuallyVisibleSignature = "";
  legacyLoadingDiagRing.length = 0;
}

export type ShuffleLoadingGateComputeInput = {
  microSlideEnabled: boolean;
  wouldShowLoading: boolean;
  trueCold: boolean;
  presentationOwned: boolean;
  presentationLatchActive: boolean;
  warmHopIntentActive: boolean;
  revealDeferred: boolean;
  handoffPreparing: boolean;
  directColdEntry: boolean;
  warmKeepAliveActive: boolean;
};

/** Pure gate — testable without DOM. */
export function computeMayPresentShuffleLoading(input: ShuffleLoadingGateComputeInput): {
  mayPresent: boolean;
  blockReason: string;
} {
  if (!input.wouldShowLoading) {
    return { mayPresent: false, blockReason: "not-requested" };
  }

  if (
    input.directColdEntry &&
    !input.presentationOwned &&
    !input.presentationLatchActive
  ) {
    return { mayPresent: true, blockReason: "direct-cold-entry" };
  }

  if (!input.microSlideEnabled) {
    return { mayPresent: true, blockReason: "micro-slide-disabled" };
  }

  if (input.presentationOwned || input.presentationLatchActive) {
    return { mayPresent: false, blockReason: "slide-owner-active" };
  }

  if (input.warmKeepAliveActive && !input.directColdEntry) {
    return { mayPresent: false, blockReason: "warm-keepalive-active" };
  }

  if (input.warmHopIntentActive || input.revealDeferred || input.handoffPreparing) {
    return { mayPresent: false, blockReason: "warm-handoff-active" };
  }

  if (!input.trueCold) {
    return { mayPresent: false, blockReason: "warm-context" };
  }

  return { mayPresent: true, blockReason: "legacy-cold-allowed" };
}

/** Direct GET/reload/deep-link cold entry — not an owned internal main-tab hop. */
export function isDirectColdShuffleEntry(input: ShufflePresentationInput): boolean {
  if (isMainTabToShufflePresentationLatchActive()) return false;
  if (isMainTabToShufflePresentationOwned()) return false;
  const tx = getMainTabToShuffleTransaction();
  if (tx && tx.phase !== "aborted" && tx.phase !== "idle") return false;
  if (isShuffleDestinationWarmIntentActive()) return false;
  if (isShuffleRevealDeferred()) return false;
  if (isShuffleHandoffPreparing()) return false;
  if (countRestorableWarmFeedSlots() >= 3) return false;
  if (hasShuffleEverHydrated()) return false;
  return isTrueColdShuffleEntry(input);
}

/**
 * Canonical presentation gate — every visible `[data-loading-shell]` must pass through here.
 * Internal state may still compute legacy loading; presentation must not mount it while slide owns.
 */
export function mayPresentShuffleLoading(
  input: ShufflePresentationInput,
  requestedShowShuffleLoading: boolean,
  caller = "deriveShufflePresentation",
): boolean {
  const trueCold = isTrueColdShuffleEntry(input);
  const directCold = isDirectColdShuffleEntry(input);
  const presentationOwned = isMainTabToShufflePresentationOwned();
  const presentationLatchActive = isMainTabToShufflePresentationLatchActive();
  const tx = getMainTabToShuffleTransaction();

  const decision = computeMayPresentShuffleLoading({
    microSlideEnabled: isMainTabToShuffleMicroSlideEnabled(),
    wouldShowLoading: requestedShowShuffleLoading,
    trueCold,
    presentationOwned,
    presentationLatchActive,
    warmHopIntentActive: isShuffleDestinationWarmIntentActive(),
    revealDeferred: isShuffleRevealDeferred(),
    handoffPreparing: isShuffleHandoffPreparing(),
    directColdEntry: directCold,
    warmKeepAliveActive: isShuffleKeepAliveSurfaceVisible(),
  });

  if (requestedShowShuffleLoading) {
    legacyLoadingAttempted += 1;
  }

  const mayPresent = decision.mayPresent;
  if (requestedShowShuffleLoading && !mayPresent) {
    legacyLoadingBlocked += 1;
    recordLegacyPresentationBlocked(caller);
    pushLegacyLoadingDiag({
      kind: "LEGACY_LOADING_BLOCKED_BY_SLIDE_OWNER",
      monoMs: monoMs(),
      pathname: pathnameNow(),
      navSeq: tx?.navSeq ?? getMainTabToShufflePresentationLatchNavSeq(),
      transactionPhase: getMainTabToShufflePhase(),
      isMainTabToShufflePresentationOwned: presentationOwned,
      presentationLatchActive,
      showShuffleLoading: requestedShowShuffleLoading,
      mayPresentShuffleLoading: mayPresent,
      trueCold,
      warm: !trueCold,
      restorableSlots: countRestorableWarmFeedSlots(),
      domSlots: input.visibleCount,
      blockReason: decision.blockReason,
      caller,
    });
  }

  pushLegacyLoadingDiag({
    kind: "LEGACY_LOADING_DECISION",
    monoMs: monoMs(),
    pathname: pathnameNow(),
    navSeq: tx?.navSeq ?? getMainTabToShufflePresentationLatchNavSeq(),
    transactionPhase: getMainTabToShufflePhase(),
    isMainTabToShufflePresentationOwned: presentationOwned,
    presentationLatchActive,
    showShuffleLoading: requestedShowShuffleLoading,
    mayPresentShuffleLoading: mayPresent,
    trueCold,
    warm: !trueCold,
    restorableSlots: countRestorableWarmFeedSlots(),
    domSlots: input.visibleCount,
    blockReason: decision.blockReason,
    caller,
  });

  return mayPresent;
}

export function traceShuffleLoadingRenderCommit(
  showShuffleLoading: boolean,
  input: ShufflePresentationInput,
  caller: string,
) {
  if (typeof window === "undefined") return;

  const tx = getMainTabToShuffleTransaction();
  const signature = `${showShuffleLoading ? "visible" : "hidden"}|${caller}|${pathnameNow()}`;
  const eventBase = {
    monoMs: monoMs(),
    pathname: pathnameNow(),
    navSeq: tx?.navSeq ?? getMainTabToShufflePresentationLatchNavSeq(),
    transactionPhase: getMainTabToShufflePhase(),
    isMainTabToShufflePresentationOwned: isMainTabToShufflePresentationOwned(),
    presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
    showShuffleLoading,
    mayPresentShuffleLoading: showShuffleLoading,
    trueCold: isTrueColdShuffleEntry(input),
    warm: !isTrueColdShuffleEntry(input),
    restorableSlots: countRestorableWarmFeedSlots(),
    domSlots: input.visibleCount,
    caller,
  } satisfies Partial<LegacyLoadingDiagEvent>;

  pushLegacyLoadingDiag({
    kind: "LEGACY_LOADING_RENDER_COMMIT",
    ...eventBase,
  });

  if (showShuffleLoading) {
    pushLegacyLoadingDiag({
      kind: "SLIDE_OWNER_STATE_AT_LOADING_COMMIT",
      ...eventBase,
    });
    if (signature !== lastRenderCommitSignature) {
      lastRenderCommitSignature = signature;
      legacyLoadingRenderCommits += 1;
      pushLegacyLoadingDiag({
        kind: "LEGACY_LOADING_BECAME_VISIBLE",
        ...eventBase,
      });
    }
    const actuallyVisible = countActuallyVisibleLoadingShells() > 0;
    const visibleSignature = `${actuallyVisible ? "dom-visible" : "dom-hidden"}|${caller}|${pathnameNow()}`;
    if (actuallyVisible && visibleSignature !== lastActuallyVisibleSignature) {
      lastActuallyVisibleSignature = visibleSignature;
      legacyLoadingActuallyVisible += 1;
      pushLegacyLoadingDiag({
        kind: "LEGACY_LOADING_ACTUALLY_VISIBLE",
        ...eventBase,
        showShuffleLoading: true,
        mayPresentShuffleLoading: true,
      });
    }
  }
}

export function buildShuffleLoadingGateSnapshot(
  input: ShufflePresentationInput,
  requestedShowShuffleLoading: boolean,
  mayPresent: boolean,
  blockReason: string,
): ShuffleLoadingGateSnapshot {
  const tx = getMainTabToShuffleTransaction();
  return {
    monoMs: monoMs(),
    pathname: pathnameNow(),
    navSeq: tx?.navSeq ?? getMainTabToShufflePresentationLatchNavSeq(),
    transactionPhase: getMainTabToShufflePhase(),
    isMainTabToShufflePresentationOwned: isMainTabToShufflePresentationOwned(),
    presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
    presentationLatchNavSeq: getMainTabToShufflePresentationLatchNavSeq(),
    showShuffleLoadingRequested: requestedShowShuffleLoading,
    mayPresentShuffleLoading: mayPresent,
    trueCold: isTrueColdShuffleEntry(input),
    warm: !isTrueColdShuffleEntry(input),
    restorableSlots: countRestorableWarmFeedSlots(),
    poolLoading: input.loading,
    poolListReady: input.listReady,
    visibleCount: input.visibleCount,
    hasShuffleEverHydrated: hasShuffleEverHydrated(),
    isShuffleRevealDeferred: isShuffleRevealDeferred(),
    isShuffleHandoffPreparing: isShuffleHandoffPreparing(),
    warmHopIntentActive: isShuffleDestinationWarmIntentActive(),
    warmHopIntent: getShuffleDestinationWarmIntent(),
    blockReason,
  };
}

if (typeof window !== "undefined") {
  window.__sayittomeLegacyLoadingGate = {
    exportRing: exportLegacyLoadingDiagRing,
    exportCounters: exportLegacyLoadingGateCounters,
    reset: resetLegacyLoadingGateCounters,
  };
}

declare global {
  interface Window {
    __sayittomeLegacyLoadingGate?: {
      exportRing: typeof exportLegacyLoadingDiagRing;
      exportCounters: typeof exportLegacyLoadingGateCounters;
      reset: typeof resetLegacyLoadingGateCounters;
    };
  }
}
