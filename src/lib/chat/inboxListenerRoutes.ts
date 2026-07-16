const INBOX_IDLE_BLOCK_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/privacy",
];

function isBlockedRoute(pathname: string) {
  return INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Full inbox Firestore queries for badge + list unread while bottom nav is live.
 * Reuses the existing inbox hooks — no extra listeners/polling.
 */
export function shouldEnableFullInboxListeners(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;

  return (
    pathname === "/shuffle" ||
    pathname === "/chats" ||
    pathname.startsWith("/chat/") ||
    pathname === "/stories" ||
    pathname.startsWith("/stories/") ||
    pathname === "/boost" ||
    pathname.startsWith("/boost/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/u/")
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

/** Warm stories index on all in-app main routes, not only the stories screen. */
export function shouldEnableStoriesRefresh(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;

  return (
    pathname === "/shuffle" ||
    pathname === "/stories" ||
    pathname.startsWith("/stories/") ||
    pathname === "/chats" ||
    pathname.startsWith("/chat/") ||
    pathname === "/boost" ||
    pathname.startsWith("/boost/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/u/")
  );
}
