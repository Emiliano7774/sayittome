const INBOX_IDLE_BLOCK_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/privacy",
];

function isBlockedRoute(pathname: string) {
  return INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Full inbox Firestore queries: shuffle, chats list, and open chat threads. */
export function shouldEnableFullInboxListeners(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;

  return (
    pathname === "/shuffle" ||
    pathname === "/chats" ||
    pathname.startsWith("/chat/")
  );
}

/** @deprecated Use shouldEnableFullInboxListeners. */
export function shouldEnableInboxListeners(pathname: string) {
  return shouldEnableFullInboxListeners(pathname);
}

/** Whip / session chat alerts on most in-app routes (not only inbox screens). */
export function shouldEnableChatAlerts(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;
  return true;
}

/** Keep message listeners for opted-in users (includes home and background). */
export function shouldEnableChatNotificationListeners(
  pathname: string,
  notificationsEnabled: boolean,
) {
  if (!pathname) return false;
  if (isBlockedRoute(pathname)) return false;
  if (pathname === "/" && !notificationsEnabled) return false;
  return true;
}

/** Stories index polling only on routes that render story UI. */
export function shouldEnableStoriesRefresh(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;

  return (
    pathname === "/shuffle" ||
    pathname === "/stories" ||
    pathname.startsWith("/stories/")
  );
}
