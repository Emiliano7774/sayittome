import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import {
  beginAtomicVisualHandoff,
  commitAtomicVisualHandoff,
  markAtomicVisualHandoffReady,
  resetAtomicVisualHandoff,
} from "@/lib/navigation/atomicVisualHandoff";
import { clearPendingVisualTab, pinMainTabKeepAlive } from "@/lib/navigation/mainTabKeepAlive";
import {
  beginShuffleRevealDeferred,
  clearShuffleExitToMainTab,
  clearShuffleHandoffState,
  getShuffleDeferSourcePath,
  isShuffleRevealDeferred,
  isShuffleSourceRetainedForMainTabExit,
  isShuffleSurfacePresented,
  presentShuffleSurface,
} from "@/lib/navigation/shuffleHandoffState";
import { stripNativeChatFullscreen } from "@/lib/navigation/nativeBack";
import {
  isInternalMainTabToShuffleTransitionActive,
  getMainTabToShufflePhase,
  getMainTabToShuffleTransaction,
  getMainTabToShufflePresentationLatchNavSeq,
  isMainTabToShufflePresentationLatchActive,
  isPostSettleRouteBridgeActive,
  getActiveSlideFailsafeTimerIdForDiag,
  recordLegacyPresentationBlocked,
  shouldBlockLegacyShufflePresentation,
  isMainTabToShufflePresentationOwned,
} from "@/lib/navigation/mainTabToShuffleTransition";
import {
  emitLegacyRevealAttempt,
  emitLegacyRevealBlocked,
  emitLegacyRevealExecuted,
  isMainTabShuffleLifecycleDiagEnabled,
  noteShuffleHostObserved,
  observeHostElement,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";
import {
  traceSlideDomWrite,
} from "@/lib/perf/mainTabShuffleSlideDomWriteDiag";
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";
import {
  beginNavCaptureSequence,
  markNavCaptureDetail,
  setNavCapturePhase,
  setNavCaptureSurface,
} from "@/lib/perf/navCaptureDiag";
import {
  canActivateShuffleWarmHandoff,
  canRevealWarmShuffleHost,
  isShuffleVisualHandoffReady,
  prepareShuffleWarmTabReturn,
  resetShuffleGeometryStability,
  setShuffleHandoffPreparing,
  sampleShuffleHandoffGeometry,
  isShuffleHandoffPreparing,
} from "@/lib/shuffle/shuffleWarmVisual";
import {
  abortShuffleDestinationWarmIntent,
  beginShuffleDestinationWarmIntent,
  countDurableRestorableWarmSlots,
  isShuffleDestinationWarmIntentActive,
  settleShuffleDestinationWarmIntent,
} from "@/lib/shuffle/shuffleWarmHopIntent";
import { readCachedShufflePool } from "@/lib/shuffle/shuffleClientCache";
import { ensureShufflePoolWarmForMicroSlide } from "@/lib/shuffle/shufflePoolWarmup";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import {
  peekPinnedShuffleWindowCount,
  restorePinnedShuffleWindowSync,
} from "@/lib/shuffle/shufflePinnedWindow";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";

export {
  getShuffleDeferSourcePath,
  isShuffleExitToMainTabPending,
  isShuffleRevealDeferred,
  isShuffleSourceRetainedForMainTabExit,
} from "@/lib/navigation/shuffleHandoffState";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

let keepAliveActive = false;
let keepAliveVersion = 0;
let instantReturnPending = false;
let suppressShuffleWindowRefresh = false;
const listeners = new Set<() => void>();

function notifyKeepAliveListeners() {
  keepAliveVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleKeepAlive(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShuffleKeepAliveVersion() {
  return keepAliveVersion;
}

export function isShuffleKeepAliveActive() {
  return keepAliveActive;
}

export function reconcileStaleShuffleHandoffState() {
  if (typeof window === "undefined") return;
  if (isInternalMainTabToShuffleTransitionActive()) return;
  if (normalizePath(window.location.pathname) !== "/shuffle") return;

  const pendingDom = document.documentElement.classList.contains("sayittome-shuffle-handoff-pending");

  if (pendingDom && !isShuffleSurfacePresented()) {
    if (canActivateShuffleWarmHandoff()) {
      activateShuffleTabSurface();
      return;
    }
    if (isShuffleRevealDeferred() || isValidWarmShuffleHandoffActive()) {
      scheduleStaleHandoffSweep();
      return;
    }
    if (!hasRestorableWarmShuffleState()) {
      enterColdShufflePresentation();
    }
    return;
  }

  if (isValidWarmShuffleHandoffActive()) return;

  if (hasRestorableWarmShuffleState() && !isShuffleSurfacePresented()) {
    scheduleStaleHandoffSweep();
    return;
  }

  if (pendingDom && !hasRestorableWarmShuffleState()) {
    enterColdShufflePresentation();
    return;
  }

  if (isShuffleRevealDeferred() && !hasRestorableWarmShuffleState()) {
    enterColdShufflePresentation();
    return;
  }

  if (pendingDom && isShuffleSurfacePresented()) {
    reconcileOrphanedShuffleHandoffDom();
  }
}

function reconcileShuffleRouteEntry() {
  reconcileStaleShuffleHandoffState();
}

/** Pin the shuffle tree before leaving /shuffle so it stays mounted under chat/profile. */
export function pinShuffleKeepAlive() {
  const wasActive = keepAliveActive;
  if (!keepAliveActive) {
    keepAliveActive = true;
    pinMainTabKeepAlive();
    notifyKeepAliveListeners();
  }
  if (!wasActive || normalizePath(window.location?.pathname ?? "") === "/shuffle") {
    reconcileShuffleRouteEntry();
  }
}

export function maybePinShuffleKeepAliveFromPath(pathname: string) {
  if (normalizePath(pathname) !== "/shuffle") return;
  pinShuffleKeepAlive();
}

export function shouldRenderShuffleKeepAliveHost(pathname: string) {
  const path = normalizePath(pathname);
  if (path === "/shuffle") return true;
  if (!keepAliveActive) return false;
  return true;
}

export function isShuffleKeepAliveVisible(pathname: string) {
  return normalizePath(pathname) === "/shuffle";
}

/** True while the pinned shuffle feed must not reshuffle or enter a loading pass. */
export function isShuffleFeedFrozen(pathname: string) {
  if (!keepAliveActive) return false;
  if (isShuffleRevealDeferred()) return true;
  return !isShuffleKeepAliveVisible(pathname);
}

export function isInstantShuffleReturnPending() {
  return instantReturnPending;
}

export function isInstantShuffleReturnDestination(pathname: string) {
  return keepAliveActive && normalizePath(pathname) === "/shuffle";
}

export function shouldSuppressShuffleWindowRefresh() {
  return suppressShuffleWindowRefresh;
}

export function releaseShuffleWindowRefreshSuppression() {
  suppressShuffleWindowRefresh = false;
}

/** Keep the current shuffle window while the user browses other tabs. */
export function pinShuffleWindowWhileAway() {
  suppressShuffleWindowRefresh = true;
}

let staleHandoffSweepId = 0;
let shuffleHandoffPendingSince = 0;
let shuffleNavSeq = 0;

type ShuffleRevealAuditEntry = {
  navSeq: number;
  caller: string;
  monoMs: number;
  tree: "FEED" | "LOADING" | "EMPTY";
  prepDomSlots: number;
  loadingShellDom: boolean;
  revealed: boolean;
};

const shuffleRevealAudit: ShuffleRevealAuditEntry[] = [];

function monoMsNow() {
  return Math.round(performance.timeOrigin + performance.now());
}

function classifyShuffleHostTree(sample: ReturnType<typeof sampleShuffleHandoffGeometry>) {
  if (!sample) return "EMPTY" as const;
  if (sample.loadingShellDom) return "LOADING" as const;
  if (sample.prepDomSlots >= 3) return "FEED" as const;
  return "EMPTY" as const;
}

function auditShuffleRevealAttempt(caller: string, revealed: boolean) {
  const sample = sampleShuffleHandoffGeometry();
  shuffleRevealAudit.push({
    navSeq: shuffleNavSeq,
    caller,
    monoMs: monoMsNow(),
    tree: classifyShuffleHostTree(sample),
    prepDomSlots: sample?.prepDomSlots ?? 0,
    loadingShellDom: sample?.loadingShellDom ?? false,
    revealed,
  });
  if (shuffleRevealAudit.length > 48) shuffleRevealAudit.shift();

  if (
    !revealed &&
    sample?.loadingShellDom &&
    (isShuffleRevealDeferred() || isShuffleHandoffPreparing() || isValidWarmShuffleHandoffActive()) &&
    isNavTraceEnabled()
  ) {
    navTraceMarkDetail("WARM_REVEAL_BLOCKED_LOADING_TREE");
  }
}

export function getShuffleNavSeq() {
  return shuffleNavSeq;
}

export function exportShuffleRevealAudit() {
  return [...shuffleRevealAudit];
}

function markShuffleHandoffPendingDom() {
  if (typeof document === "undefined") return;
  if (!document.documentElement.classList.contains("sayittome-shuffle-handoff-pending")) {
    shuffleHandoffPendingSince = performance.now();
  }
  document.documentElement.classList.add("sayittome-shuffle-handoff-pending");
  const defer = getShuffleDeferSourcePath() || "/chats";
  const sourceKey = String(defer).replace(/^\//, "").split("/")[0];
  if (sourceKey) {
    document.documentElement.setAttribute("data-shuffle-defer-source", sourceKey);
  }
  scheduleStaleHandoffSweep();
}

function clearShuffleHandoffPendingDom(options?: { force?: boolean }) {
  if (typeof document === "undefined") return;
  if (!options?.force && isMainTabToShufflePresentationOwned()) {
    recordLegacyPresentationBlocked("clearShuffleHandoffPendingDom");
    return;
  }
  document.documentElement.classList.remove("sayittome-shuffle-handoff-pending");
  document.documentElement.removeAttribute("data-shuffle-defer-source");
  shuffleHandoffPendingSince = 0;
}

function scheduleStaleHandoffSweep() {
  if (typeof window === "undefined" || staleHandoffSweepId) return;
  staleHandoffSweepId = requestAnimationFrame(function sweepStaleHandoff() {
    staleHandoffSweepId = 0;
    if (normalizePath(window.location.pathname) !== "/shuffle") return;

    reconcileStaleShuffleHandoffState();

    const pendingDom = document.documentElement.classList.contains("sayittome-shuffle-handoff-pending");
    if (!pendingDom || isShuffleSurfacePresented()) return;

    if (canActivateShuffleWarmHandoff()) {
      activateShuffleTabSurface();
      return;
    }

    if (isValidWarmShuffleHandoffActive() || isShuffleRevealDeferred()) {
      scheduleStaleHandoffSweep();
      return;
    }

    if (!hasRestorableWarmShuffleState()) {
      enterColdShufflePresentation({ force: true });
    }
  });
}

export function reconcileOrphanedShuffleHandoffDom() {
  if (typeof document === "undefined") return;
  if (!document.documentElement.classList.contains("sayittome-shuffle-handoff-pending")) return;
  if (isValidWarmShuffleHandoffActive()) return;
  clearShuffleHandoffPendingDom();
}

function legacyRevealBlockReason(microSlideSettle?: boolean) {
  if (microSlideSettle) return null;
  if (getMainTabToShufflePhase() === "settled") return null;
  if (!shouldBlockLegacyShufflePresentation()) return null;
  if (isMainTabToShufflePresentationLatchActive()) return "presentation-latch-active";
  if (isPostSettleRouteBridgeActive()) return "post-settle-bridge-active";
  const phase = getMainTabToShufflePhase();
  if (phase !== "idle" && phase !== "aborted") return `phase-${phase}`;
  return "pinned-soft-commit-tx";
}

function recordLegacyRevealLifecycle(
  caller: string,
  options?: { microSlideSettle?: boolean; executed?: boolean; blockedReason?: string | null },
) {
  if (!isMainTabShuffleLifecycleDiagEnabled()) return;
  const tx = getMainTabToShuffleTransaction();
  const pathname = window.location.pathname.split("?")[0].split("#")[0];
  const blockReason =
    options?.blockedReason ?? legacyRevealBlockReason(options?.microSlideSettle);
  const shouldBlock = Boolean(blockReason);
  emitLegacyRevealAttempt({
    caller,
    pathname,
    transactionId: tx?.transactionId ?? null,
    phase: getMainTabToShufflePhase(),
    navSeq: tx?.navSeq ?? 0,
    presentationLatchNavSeq: getMainTabToShufflePresentationLatchNavSeq(),
    presentationLatchActive: isMainTabToShufflePresentationLatchActive(),
    postSettleBridgeActive: isPostSettleRouteBridgeActive(),
    shouldBlockLegacyShufflePresentation: shouldBlock,
    blockReason,
    shuffleHostInstanceId: noteShuffleHostObserved(
      document.getElementById("sayittome-shuffle-keepalive-host"),
      `${caller}-attempt`,
    ),
    slideFailsafeTimerId: getActiveSlideFailsafeTimerIdForDiag(),
  });
  if (options?.executed) {
    emitLegacyRevealExecuted({
      caller,
      pathname,
      transactionId: tx?.transactionId ?? null,
      phase: getMainTabToShufflePhase(),
      navSeq: tx?.navSeq ?? 0,
      shuffleHostInstanceId: noteShuffleHostObserved(
        document.getElementById("sayittome-shuffle-keepalive-host"),
        `${caller}-executed`,
      ),
    });
  } else if (shouldBlock && blockReason) {
    emitLegacyRevealBlocked({
      caller,
      pathname,
      transactionId: tx?.transactionId ?? null,
      phase: getMainTabToShufflePhase(),
      navSeq: tx?.navSeq ?? 0,
      blockReason,
    });
  }
}

function revealShuffleKeepAliveHostSync(caller = "revealShuffleKeepAliveHostSync") {
  if (typeof document === "undefined") return false;

  if (shouldBlockLegacyShufflePresentation()) {
    recordLegacyRevealLifecycle(caller, { blockedReason: legacyRevealBlockReason() });
    recordLegacyPresentationBlocked(caller);
    auditShuffleRevealAttempt(caller, false);
    return false;
  }

  const warmHop =
    isShuffleDestinationWarmIntentActive() ||
    isShuffleRevealDeferred() ||
    isShuffleHandoffPreparing() ||
    isValidWarmShuffleHandoffActive();
  if (warmHop && !canRevealWarmShuffleHost()) {
    auditShuffleRevealAttempt(caller, false);
    return false;
  }

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) {
    auditShuffleRevealAttempt(caller, false);
    return false;
  }

  host.classList.remove("sayittome-shuffle-keepalive-frozen");
  host.classList.add("sayittome-shuffle-keepalive-visible");
  host.setAttribute("aria-hidden", "false");
  auditShuffleRevealAttempt(caller, true);
  recordLegacyRevealLifecycle(caller, { executed: true });
  return true;
}

function freezeShuffleKeepAliveHostSync() {
  if (typeof document === "undefined") return;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return;

  host.classList.remove("sayittome-shuffle-keepalive-visible");
  host.classList.remove("sayittome-route-bridge-shuffle-owner");
  host.classList.add("sayittome-shuffle-keepalive-frozen");
  host.setAttribute("aria-hidden", "true");
}

/** Keep prep shuffle host physically presentable while canonical owner is route_bridge. */
export function keepPresentedShuffleSurfaceForRouteBridge() {
  if (typeof document === "undefined") return false;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return false;

  host.classList.remove("sayittome-shuffle-keepalive-frozen");
  host.classList.add("sayittome-shuffle-keepalive-visible");
  host.classList.add("sayittome-route-bridge-shuffle-owner");
  host.setAttribute("aria-hidden", "false");
  const tx = getMainTabToShuffleTransaction();
  traceSlideDomWrite(
    {
      writerId: "BRIDGE_OWNER_NORMALIZE_TRANSFORM",
      caller: "keepPresentedShuffleSurfaceForRouteBridge",
      transactionId: tx?.transactionId ?? null,
      phase: tx?.phase ?? getMainTabToShufflePhase(),
      navSeq: tx?.navSeq ?? 0,
      nodeRole: "host",
      nodeInstanceId: observeHostElement(host),
      property: "transform",
      intendedValue: "none",
    },
    host,
    (el) => {
      el.style.transform = "none";
    },
  );
  traceSlideDomWrite(
    {
      writerId: "BRIDGE_OWNER_NORMALIZE_TRANSITION",
      caller: "keepPresentedShuffleSurfaceForRouteBridge",
      transactionId: tx?.transactionId ?? null,
      phase: tx?.phase ?? getMainTabToShufflePhase(),
      navSeq: tx?.navSeq ?? 0,
      nodeRole: "host",
      nodeInstanceId: observeHostElement(host),
      property: "transition",
      intendedValue: "none",
    },
    host,
    (el) => {
      el.style.transition = "none";
    },
  );
  host.style.removeProperty("will-change");

  document.documentElement.setAttribute("data-post-settle-route-bridge", "1");
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");

  notifyKeepAliveListeners();
  return true;
}

export type ReleasePresentedShuffleOwnerOptions = {
  /**
   * Abort / cleanup paths freeze the prep host.
   * Successful final handoff must keep the host visible and call
   * `activateShuffleTabSurface` before dropping route-bridge CSS — freezing
   * here creates a post-arrival source-tab flash (second paint).
   */
  freeze?: boolean;
};

/** Drop route-bridge owner chrome; freeze only when not promoting to final presentation. */
export function releasePresentedShuffleOwnerSurface(
  options?: ReleasePresentedShuffleOwnerOptions,
) {
  if (typeof document === "undefined") return;

  const freeze = options?.freeze !== false;
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (host) {
    const tx = getMainTabToShuffleTransaction();
    host.classList.remove("sayittome-route-bridge-shuffle-owner");
    host.classList.remove("sayittome-slide-shuffle-active");
    if (host instanceof HTMLElement) {
      traceSlideDomWrite(
        {
          writerId: "BRIDGE_RELEASE_CLEAR_TRANSFORM",
          caller: "releasePresentedShuffleOwnerSurface",
          transactionId: tx?.transactionId ?? null,
          phase: tx?.phase ?? getMainTabToShufflePhase(),
          navSeq: tx?.navSeq ?? 0,
          nodeRole: "host",
          nodeInstanceId: observeHostElement(host),
          property: "transform",
          intendedValue: null,
        },
        host,
        (el) => {
          el.style.removeProperty("transition");
          el.style.removeProperty("transform");
          el.style.removeProperty("will-change");
        },
      );
    }
    if (!freeze) {
      // Keep continuous presentation across bridge → final ownership.
      host.classList.remove("sayittome-shuffle-keepalive-frozen");
      host.classList.add("sayittome-shuffle-keepalive-visible");
      host.setAttribute("aria-hidden", "false");
    }
  }

  if (freeze) {
    freezeShuffleKeepAliveHostSync();
  }
  notifyKeepAliveListeners();
}

function revealShuffleKeepAliveHost() {
  revealShuffleKeepAliveHostSync();
}

export function finishShuffleHandoffPreparing() {
  setShuffleHandoffPreparing(false);
}

export function hasRestorableWarmShuffleState() {
  if (getVisibleShuffleProfiles().length >= 3) return true;
  if (countDurableRestorableWarmSlots() >= 3) return true;

  const cached = readCachedShufflePool();
  if (cached && cached.length >= 3) return true;

  return hasShuffleEverHydrated() && peekPinnedShuffleWindowCount() > 0;
}

/** Warm handoff may retain source only while deferred reveal has restorable shuffle slots. */
export function isValidWarmShuffleHandoffActive() {
  if (!isShuffleRevealDeferred()) return false;
  if (hasRestorableWarmShuffleState()) return true;
  return hasShuffleEverHydrated();
}

function presentShuffleAfterWarmRestore() {
  if (!canRevealWarmShuffleHost()) return false;

  if (!revealShuffleKeepAliveHostSync("presentShuffleAfterWarmRestore")) return false;
  presentShuffleSurface();
  finishShuffleHandoffPreparing();
  clearShuffleHandoffPendingDom();
  settleShuffleDestinationWarmIntent();
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");
  window.scrollTo(0, 0);
  notifyKeepAliveListeners();
  return true;
}

/** Cold / aborted exit — clear pending retention and present Shuffle normally. */
export function enterColdShufflePresentation(options?: { force?: boolean }) {
  if (typeof window === "undefined") return;

  if (shouldBlockLegacyShufflePresentation()) {
    recordLegacyPresentationBlocked("enterColdShufflePresentation");
    return;
  }

  if (!options?.force && isShuffleDestinationWarmIntentActive()) {
    prepareShuffleTabReturn();
    return;
  }

  restorePinnedShuffleWindowSync();

  if (
    !options?.force &&
    isShuffleKeepAliveActive() &&
    hasRestorableWarmShuffleState() &&
    !isShuffleSurfacePresented()
  ) {
    prepareShuffleTabReturn();
    return;
  }

  if (
    !options?.force &&
    isShuffleKeepAliveActive() &&
    hasShuffleEverHydrated() &&
    !isShuffleSurfacePresented() &&
    !isShuffleRevealDeferred()
  ) {
    prepareShuffleWarmTabReturn();
    if (presentShuffleAfterWarmRestore()) return;
    return;
  }

  clearShuffleHandoffPendingDom();
  clearShuffleHandoffState();
  finishShuffleHandoffPreparing();
  abortShuffleDestinationWarmIntent();
  resetAtomicVisualHandoff();
  resetShuffleGeometryStability();
  releaseShuffleWindowRefreshSuppression();
  suppressShuffleWindowRefresh = false;
  prepareShuffleWarmTabReturn();

  if (!options?.force && presentShuffleAfterWarmRestore()) return;

  if (hasRestorableWarmShuffleState() || hasShuffleEverHydrated()) {
    prepareShuffleTabReturn();
    return;
  }

  if (!revealShuffleKeepAliveHostSync("enterColdShufflePresentation")) return;
  presentShuffleSurface();
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");
  window.scrollTo(0, 0);
  notifyKeepAliveListeners();
}

export function abortShuffleWarmHandoff() {
  if (hasRestorableWarmShuffleState() || hasShuffleEverHydrated()) {
    prepareShuffleTabReturn();
    return;
  }
  enterColdShufflePresentation({ force: true });
}

/** PREPARE before router commits — keep origin tab visible until shuffle has a valid frame. */
export function beginShuffleWarmHandoff(fromPath?: string) {
  if (typeof window === "undefined") return false;

  shuffleNavSeq += 1;
  const durableRestorable = countDurableRestorableWarmSlots();
  const destinationWarm = durableRestorable >= 3 || hasShuffleEverHydrated();
  const microSlideColdWarmup =
    isMainTabToShuffleMicroSlideEnabled() && isInternalMainTabToShuffleTransitionActive();

  if (microSlideColdWarmup) {
    beginShuffleDestinationWarmIntent(shuffleNavSeq, durableRestorable, {
      allowColdWarmup: true,
    });
    void ensureShufflePoolWarmForMicroSlide();
  } else {
    beginShuffleDestinationWarmIntent(shuffleNavSeq, durableRestorable);
  }

  restorePinnedShuffleWindowSync();
  if (!keepAliveActive) {
    if (!destinationWarm && !microSlideColdWarmup) {
      abortShuffleDestinationWarmIntent();
      return false;
    }
    pinShuffleKeepAlive();
  }

  if (!destinationWarm && !microSlideColdWarmup) {
    abortShuffleDestinationWarmIntent();
    return false;
  }

  clearPendingVisualTab();
  resetShuffleGeometryStability();
  beginAtomicVisualHandoff();
  prepareShuffleWarmTabReturn();
  beginShuffleRevealDeferred(fromPath || "/chats");
  setShuffleHandoffPreparing(true);
  markShuffleHandoffPendingDom();
  beginNavCaptureSequence("chats-to-shuffle");
  setNavCapturePhase("PREPARING_SHUFFLE", fromPath || "/chats");
  setNavCaptureSurface("CHATS", "source-retained");

  if (isNavTraceEnabled()) {
    navTraceMarkDetail("shuffle-handoff-prepare");
  }

  notifyKeepAliveListeners();
  return true;
}
export function prepareShuffleTabReturn(): boolean {
  if (typeof window === "undefined" || !keepAliveActive) return false;
  if (!hasRestorableWarmShuffleState()) return false;

  restorePinnedShuffleWindowSync();
  suppressShuffleWindowRefresh = true;
  releaseChatViewportLock();
  resetShuffleGeometryStability();
  beginAtomicVisualHandoff();
  prepareShuffleWarmTabReturn();
  if (!isShuffleRevealDeferred()) {
    beginShuffleRevealDeferred(getShuffleDeferSourcePath());
  }
  setShuffleHandoffPreparing(true);
  markShuffleHandoffPendingDom();

  if (isNavTraceEnabled()) {
    navTraceMarkDetail("shuffle-tab-return-prepare");
  }

  notifyKeepAliveListeners();
  return true;
}

/** ATOMIC ACTIVATE — single sync block: reveal shuffle, then hide source. */
export function activateShuffleTabSurface(options?: { microSlideSettle?: boolean }) {
  if (typeof window === "undefined") return;

  recordLegacyRevealLifecycle("activateShuffleTabSurface", {
    microSlideSettle: options?.microSlideSettle,
  });

  if (
    !options?.microSlideSettle &&
    getMainTabToShufflePhase() !== "settled" &&
    shouldBlockLegacyShufflePresentation()
  ) {
    recordLegacyPresentationBlocked("activateShuffleTabSurface");
    return;
  }

  restorePinnedShuffleWindowSync();

  // Final post-settle handoff already validated DOM readiness. Do not let warm
  // geometry gates no-op activate after ownership was intentionally released —
  // that re-freezes the host once route-bridge CSS is cleared (post-arrival flash).
  if (!options?.microSlideSettle) {
    const warmHop =
      isShuffleDestinationWarmIntentActive() ||
      isShuffleRevealDeferred() ||
      isShuffleHandoffPreparing() ||
      isValidWarmShuffleHandoffActive();
    if (warmHop) {
      if (!canActivateShuffleWarmHandoff()) return;
    } else if (!isShuffleVisualHandoffReady() && !canActivateShuffleWarmHandoff()) {
      return;
    }
  }

  markAtomicVisualHandoffReady();

  if (options?.microSlideSettle) {
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    if (!host) return;
    host.classList.remove("sayittome-shuffle-keepalive-frozen");
    host.classList.add("sayittome-shuffle-keepalive-visible");
    host.setAttribute("aria-hidden", "false");
    recordLegacyRevealLifecycle("activateShuffleTabSurface", {
      microSlideSettle: true,
      executed: true,
    });
  } else if (!revealShuffleKeepAliveHostSync("activateShuffleTabSurface")) {
    return;
  }

  setNavCapturePhase("SWAPPING_SHUFFLE");
  markNavCaptureDetail("imperative-reveal-shuffle-host");

  presentShuffleSurface();
  finishShuffleHandoffPreparing();
  // Always settle warm intent on activate — final handoff must leave deferred clear.
  settleShuffleDestinationWarmIntent();
  commitAtomicVisualHandoff();
  setNavCapturePhase("SHUFFLE_PRESENTED");
  setNavCaptureSurface("SHUFFLE");

  markNavCaptureDetail("body-class-shuffle-route");
  document.body.classList.add("sayittome-shuffle-route");
  markNavCaptureDetail("body-class-shuffle-surface-active");
  document.body.classList.add("sayittome-shuffle-surface-active");
  clearShuffleHandoffPendingDom();
  window.scrollTo(0, 0);

  if (isNavTraceEnabled()) {
    navTraceMarkDetail("shuffle-tab-activate");
  }

  notifyKeepAliveListeners();
}

export function releaseShuffleTabSurface() {
  if (typeof document === "undefined") return;

  document.body.classList.remove("sayittome-shuffle-route");
  document.body.classList.remove("sayittome-shuffle-surface-active");
  clearShuffleHandoffPendingDom();
  clearShuffleHandoffState();
  clearShuffleExitToMainTab();
  finishShuffleHandoffPreparing();
  resetAtomicVisualHandoff();
  resetShuffleGeometryStability();
  freezeShuffleKeepAliveHostSync();
  notifyKeepAliveListeners();
}

/** @deprecated Use prepareShuffleTabReturn + activateShuffleTabSurface */
export function commitShuffleTabReturn() {
  prepareShuffleTabReturn();
  if (isShuffleVisualHandoffReady()) {
    activateShuffleTabSurface();
  }
}

export function canShowShuffleKeepAliveSurface(pathname: string) {
  const path = normalizePath(pathname);
  // Never paint Shuffle under profile / chat / other non-main routes — retain
  // and post-settle bridges must not win while /u/* is the live URL.
  if (
    path.startsWith("/u/") ||
    path.startsWith("/chat/") ||
    (path !== "/shuffle" &&
      path !== "/stories" &&
      path !== "/chats" &&
      path !== "/boost" &&
      path !== "/settings")
  ) {
    return false;
  }
  if (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-post-settle-route-bridge")
  ) {
    return true;
  }
  if (isInstantShuffleReturnPending()) return true;
  if (isShuffleSourceRetainedForMainTabExit()) return true;
  if (!isShuffleKeepAliveVisible(pathname)) return false;
  if (isShuffleRevealDeferred()) return false;
  if (!keepAliveActive) return true;
  if (isShuffleKeepAliveVisible(pathname) && isShuffleSurfacePresented()) return true;
  if (!isShuffleSurfacePresented()) return false;
  if (!isShuffleVisualHandoffReady()) return false;
  return true;
}

/** Reveal the pinned shuffle before chat unmounts so back feels instant. */
export function prepareInstantShuffleReturn() {
  if (typeof document === "undefined" || !keepAliveActive) return;

  instantReturnPending = true;
  suppressShuffleWindowRefresh = true;
  notifyKeepAliveListeners();

  document.documentElement.classList.add("sayittome-shuffle-return-pending");
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");
  revealShuffleKeepAliveHost();
  stripNativeChatFullscreen();
  releaseChatViewportLock();
}

export function clearInstantShuffleReturn() {
  if (typeof document === "undefined") return;

  instantReturnPending = false;
  notifyKeepAliveListeners();
  document.documentElement.classList.remove("sayittome-shuffle-return-pending");
}

if (typeof window !== "undefined") {
  const runStaleHandoffReconcile = () => {
    reconcileStaleShuffleHandoffState();
    scheduleStaleHandoffSweep();
  };

  queueMicrotask(runStaleHandoffReconcile);
  window.addEventListener("pageshow", runStaleHandoffReconcile);
  window.addEventListener("focus", runStaleHandoffReconcile);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      runStaleHandoffReconcile();
    }
  });
}
