import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
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
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";
import {
  beginNavCaptureSequence,
  markNavCaptureDetail,
  setNavCapturePhase,
  setNavCaptureSurface,
} from "@/lib/perf/navCaptureDiag";
import {
  isShuffleVisualHandoffReady,
  canActivateShuffleWarmHandoff,
  prepareShuffleWarmTabReturn,
  resetShuffleGeometryStability,
  setShuffleHandoffPreparing,
} from "@/lib/shuffle/shuffleWarmVisual";
import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { readCachedShufflePool } from "@/lib/shuffle/shuffleClientCache";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import {
  peekPinnedShuffleWindowCount,
  restorePinnedShuffleWindowSync,
} from "@/lib/shuffle/shufflePinnedWindow";
import { sampleShuffleHandoffGeometry } from "@/lib/shuffle/shuffleWarmVisual";

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
  if (normalizePath(window.location.pathname) !== "/shuffle") return;

  const pendingDom = document.documentElement.classList.contains("sayittome-shuffle-handoff-pending");

  if (pendingDom && !isShuffleSurfacePresented()) {
    if (canActivateShuffleWarmHandoff()) {
      activateShuffleTabSurface();
      return;
    }
    if (isShuffleRevealDeferred() && shuffleHandoffPendingAgeMs() < 500) return;
    if (hasRestorableWarmShuffleState() || hasShuffleEverHydrated()) {
      activateShuffleTabSurface({ force: true });
      return;
    }
    enterColdShufflePresentation({ force: true });
    return;
  }

  if (isValidWarmShuffleHandoffActive()) return;

  if (hasRestorableWarmShuffleState() && !isShuffleSurfacePresented()) {
    activateShuffleTabSurface({ force: true });
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

function markShuffleHandoffPendingDom() {
  if (typeof document === "undefined") return;
  if (!document.documentElement.classList.contains("sayittome-shuffle-handoff-pending")) {
    shuffleHandoffPendingSince = performance.now();
  }
  document.documentElement.classList.add("sayittome-shuffle-handoff-pending");
  scheduleStaleHandoffSweep();
}

function clearShuffleHandoffPendingDom() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("sayittome-shuffle-handoff-pending");
  shuffleHandoffPendingSince = 0;
}

function shuffleHandoffPendingAgeMs() {
  if (!shuffleHandoffPendingSince) return 0;
  return Math.max(0, Math.round(performance.now() - shuffleHandoffPendingSince));
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

    if (isValidWarmShuffleHandoffActive() && shuffleHandoffPendingAgeMs() < 500) {
      scheduleStaleHandoffSweep();
      return;
    }

    if (hasRestorableWarmShuffleState() || hasShuffleEverHydrated()) {
      activateShuffleTabSurface({ force: true });
      return;
    }

    enterColdShufflePresentation({ force: true });
  });
}

export function reconcileOrphanedShuffleHandoffDom() {
  if (typeof document === "undefined") return;
  if (!document.documentElement.classList.contains("sayittome-shuffle-handoff-pending")) return;
  if (isValidWarmShuffleHandoffActive()) return;
  clearShuffleHandoffPendingDom();
}

function revealShuffleKeepAliveHostSync() {
  if (typeof document === "undefined") return false;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return false;

  host.classList.remove("sayittome-shuffle-keepalive-frozen");
  host.classList.add("sayittome-shuffle-keepalive-visible");
  host.setAttribute("aria-hidden", "false");
  return true;
}

function freezeShuffleKeepAliveHostSync() {
  if (typeof document === "undefined") return;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return;

  host.classList.remove("sayittome-shuffle-keepalive-visible");
  host.classList.add("sayittome-shuffle-keepalive-frozen");
  host.setAttribute("aria-hidden", "true");
}

function revealShuffleKeepAliveHost() {
  revealShuffleKeepAliveHostSync();
}

export function finishShuffleHandoffPreparing() {
  setShuffleHandoffPreparing(false);
}

export function hasRestorableWarmShuffleState() {
  if (getVisibleShuffleProfiles().length >= 3) return true;
  if (peekPinnedShuffleWindowCount() >= 3) return true;

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
  if (!canActivateShuffleWarmHandoff()) return false;

  revealShuffleKeepAliveHostSync();
  presentShuffleSurface();
  finishShuffleHandoffPreparing();
  clearShuffleHandoffPendingDom();
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");
  window.scrollTo(0, 0);
  notifyKeepAliveListeners();
  return true;
}

/** Cold / aborted exit — clear pending retention and present Shuffle normally. */
export function enterColdShufflePresentation(options?: { force?: boolean }) {
  if (typeof window === "undefined") return;

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
  resetAtomicVisualHandoff();
  resetShuffleGeometryStability();
  releaseShuffleWindowRefreshSuppression();
  suppressShuffleWindowRefresh = false;
  prepareShuffleWarmTabReturn();

  if (!options?.force && presentShuffleAfterWarmRestore()) return;

  revealShuffleKeepAliveHostSync();
  presentShuffleSurface();
  document.body.classList.add("sayittome-shuffle-route");
  document.body.classList.add("sayittome-shuffle-surface-active");
  window.scrollTo(0, 0);
  notifyKeepAliveListeners();
}

export function abortShuffleWarmHandoff() {
  enterColdShufflePresentation({ force: true });
}

/** PREPARE before router commits — keep origin tab visible until shuffle has a valid frame. */
export function beginShuffleWarmHandoff(fromPath?: string) {
  if (typeof window === "undefined") return false;

  if (!keepAliveActive) {
    restorePinnedShuffleWindowSync();
    if (!hasRestorableWarmShuffleState() && !hasShuffleEverHydrated()) return false;
    pinShuffleKeepAlive();
  }

  restorePinnedShuffleWindowSync();
  if (!hasRestorableWarmShuffleState() && !hasShuffleEverHydrated()) return false;

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
export function activateShuffleTabSurface(options?: { force?: boolean }) {
  if (typeof window === "undefined") return;
  const warmReady = canActivateShuffleWarmHandoff();
  if (!options?.force && !warmReady && !isShuffleVisualHandoffReady()) return;

  markAtomicVisualHandoffReady();

  const revealed = revealShuffleKeepAliveHostSync();
  if (!revealed && !options?.force) return;

  setNavCapturePhase("SWAPPING_SHUFFLE");
  markNavCaptureDetail("imperative-reveal-shuffle-host");

  presentShuffleSurface();
  finishShuffleHandoffPreparing();
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
