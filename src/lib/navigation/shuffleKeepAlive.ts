import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { stripNativeChatFullscreen } from "@/lib/navigation/nativeBack";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

let keepAliveActive = false;
let keepAliveVersion = 0;
let instantReturnPending = false;
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

  if (path.startsWith("/chat/")) return true;
  if (path.startsWith("/u/")) return true;
  return false;
}

export function isShuffleKeepAliveVisible(pathname: string) {
  return normalizePath(pathname) === "/shuffle";
}

/** True while the pinned shuffle feed sits under chat/profile and must not reshuffle. */
export function isShuffleFeedFrozen(pathname: string) {
  return keepAliveActive && !isShuffleKeepAliveVisible(pathname);
}

export function isInstantShuffleReturnPending() {
  return instantReturnPending;
}

export function isInstantShuffleReturnDestination(pathname: string) {
  return keepAliveActive && normalizePath(pathname) === "/shuffle";
}

function revealShuffleKeepAliveHost() {
  if (typeof document === "undefined") return;

  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (!host) return;

  host.classList.remove("sayittome-shuffle-keepalive-frozen");
  host.classList.add("sayittome-shuffle-keepalive-visible");
  host.setAttribute("aria-hidden", "false");
}

/** Reveal the pinned shuffle before chat unmounts so back feels instant. */
export function prepareInstantShuffleReturn() {
  if (typeof document === "undefined" || !keepAliveActive) return;

  instantReturnPending = true;
  notifyKeepAliveListeners();

  document.documentElement.classList.add("sayittome-shuffle-return-pending");
  document.body.classList.add("sayittome-shuffle-route");
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
