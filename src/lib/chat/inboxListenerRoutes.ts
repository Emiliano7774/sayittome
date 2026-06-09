const INBOX_IDLE_BLOCK_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/privacy",
];

/** Inbox Firestore queries on main app routes (alerts + unread need live inbox). */
export function shouldEnableInboxListeners(pathname: string) {
  return shouldEnableChatAlerts(pathname);
}

/** Whip / session chat alerts on main app routes (lighter than full inbox). */
export function shouldEnableChatAlerts(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return true;
}
