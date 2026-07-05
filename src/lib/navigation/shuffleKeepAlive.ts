function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

let keepAliveActive = false;
let keepAliveVersion = 0;
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
  if (!keepAliveActive) return false;

  const path = normalizePath(pathname);
  if (path === "/shuffle") return true;
  if (path.startsWith("/chat/")) return true;
  if (path.startsWith("/u/")) return true;
  return false;
}

export function isShuffleKeepAliveVisible(pathname: string) {
  return normalizePath(pathname) === "/shuffle";
}
