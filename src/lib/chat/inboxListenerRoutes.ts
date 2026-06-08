const INBOX_HEAVY_PREFIXES = ["/chats", "/chat/"];

const INBOX_IDLE_BLOCK_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/privacy",
];

/** Full inbox Firestore queries — only where the inbox UI or an open chat needs them. */
export function shouldEnableInboxListeners(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return INBOX_HEAVY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/** Whip / session chat alerts on main app routes (lighter than full inbox). */
export function shouldEnableChatAlerts(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return true;
}
