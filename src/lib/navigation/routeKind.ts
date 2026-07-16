import { isMainTabHref, MAIN_TAB_HREFS } from "@/lib/navigation/mainTabs";

export type AppRouteKind =
  | "main-tab"
  | "shuffle"
  | "profile"
  | "profile-chat"
  | "chat-thread"
  | "non-main";

function normalizePath(pathname: string) {
  return String(pathname || "/").split("?")[0].split("#")[0] || "/";
}

/** Exact main-tab hrefs including /shuffle. */
export function isMainTabRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

/** Public profile pages: /u/[username] (not /chat). */
export function isProfileRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith("/u/")) return false;
  const rest = path.slice(3);
  if (!rest || rest.includes("/")) return false;
  return true;
}

/** /u/[username]/chat redirect shell. */
export function isProfileChatRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith("/u/")) return false;
  return path.endsWith("/chat");
}

export function isChatThreadRoute(pathname: string): boolean {
  return normalizePath(pathname).startsWith("/chat/");
}

/**
 * Any route that must not paint main-tab keepalive panels or a stale
 * bottom-nav selection (profile, profile-chat, chat thread, etc.).
 */
export function isNonMainRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (isMainTabHref(path) || path === "/shuffle") return false;
  return true;
}

export function classifyAppRouteKind(pathname: string): AppRouteKind {
  const path = normalizePath(pathname);
  if (path === "/shuffle") return "shuffle";
  if (isMainTabHref(path)) return "main-tab";
  if (isProfileChatRoute(path)) return "profile-chat";
  if (isProfileRoute(path)) return "profile";
  if (isChatThreadRoute(path)) return "chat-thread";
  return "non-main";
}

/** Bottom-nav may highlight a tab only on concrete main-tab / shuffle routes. */
export function canSelectBottomNavMainTab(pathname: string): boolean {
  const path = normalizePath(pathname);
  return isMainTabHref(path) || path === "/shuffle";
}
