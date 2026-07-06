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
  clearShuffleHandoffState,
  getShuffleDeferSourcePath,
  isShuffleRevealDeferred,
  isShuffleSurfacePresented,
  presentShuffleSurface,
} from "@/lib/navigation/shuffleHandoffState";
import { stripNativeChatFullscreen } from "@/lib/navigation/nativeBack";
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";
import {
  isShuffleVisualHandoffReady,
  prepareShuffleWarmTabReturn,
  resetShuffleGeometryStability,
  setShuffleHandoffPreparing,
} from "@/lib/shuffle/shuffleWarmVisual";

export { getShuffleDeferSourcePath, isShuffleRevealDeferred } from "@/lib/navigation/shuffleHandoffState";

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

/** Pin the shuffle tree before leaving /shuffle so it stays mounted under chat/profile. */
export function pinShuffleKeepAlive() {
  if (keepAliveActive) return;
  keepAliveActive = true;
  pinMainTabKeepAlive();
  notifyKeepAliveListeners();
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

function markShuffleHandoffPendingDom() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("sayittome-shuffle-handoff-pending");
}

function clearShuffleHandoffPendingDom() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("sayittome-shuffle-handoff-pending");
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

/** PREPARE before router commits — keep origin tab visible until shuffle has a valid frame. */
export function beginShuffleWarmHandoff(fromPath?: string) {
  if (typeof window === "undefined" || !keepAliveActive) return;

  clearPendingVisualTab();
  resetShuffleGeometryStability();
  beginAtomicVisualHandoff();
  prepareShuffleWarmTabReturn();
  beginShuffleRevealDeferred(fromPath || "/chats");
  setShuffleHandoffPreparing(true);
  markShuffleHandoffPendingDom();

  if (isNavTraceEnabled()) {
    navTraceMarkDetail("shuffle-handoff-prepare");
  }

  notifyKeepAliveListeners();
}

/** PREPARE on route commit — restore slots while origin tab stays visible. */
export function prepareShuffleTabReturn() {
  if (typeof window === "undefined" || !keepAliveActive) return;

  suppressShuffleWindowRefresh = true;
  releaseChatViewportLock();
  resetShuffleGeometryStability();
  beginAtomicVisualHandoff();
  prepareShuffleWarmTabReturn();
  beginShuffleRevealDeferred(getShuffleDeferSourcePath());
  setShuffleHandoffPreparing(true);
  markShuffleHandoffPendingDom();

  if (isNavTraceEnabled()) {
    navTraceMarkDetail("shuffle-tab-return-prepare");
  }

  notifyKeepAliveListeners();
}

/** ATOMIC ACTIVATE — single sync block: reveal shuffle, then hide source. */
export function activateShuffleTabSurface(options?: { force?: boolean }) {
  if (typeof window === "undefined") return;
  if (!options?.force && !isShuffleVisualHandoffReady()) return;

  markAtomicVisualHandoffReady();

  const revealed = revealShuffleKeepAliveHostSync();
  if (!revealed && !options?.force) return;

  presentShuffleSurface();
  finishShuffleHandoffPreparing();
  commitAtomicVisualHandoff();

  document.body.classList.add("sayittome-shuffle-route");
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
  if (!isShuffleKeepAliveVisible(pathname)) return false;
  if (isShuffleRevealDeferred()) return false;
  if (!keepAliveActive) return true;
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
