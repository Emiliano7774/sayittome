import { isNativeAppShell } from "@/lib/app/nativeShell";

const INBOX_IDLE_BLOCK_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/privacy",
];

function isBlockedRoute(pathname: string) {
  return INBOX_IDLE_BLOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isNativeChatsRoute(pathname: string) {
  return isNativeAppShell() && pathname === "/chats";
}

/** Full inbox Firestore queries: shuffle, chats list, and open chat threads. */
export function shouldEnableFullInboxListeners(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (isBlockedRoute(pathname)) return false;
  if (isNativeChatsRoute(pathname)) return false;

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

/** Whip / session chat alerts follow the same routes as full inbox. */
export function shouldEnableChatAlerts(pathname: string) {
  return shouldEnableFullInboxListeners(pathname);
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
