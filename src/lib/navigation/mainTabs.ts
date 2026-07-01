export const MAIN_TAB_HREFS = [
  "/stories",
  "/chats",
  "/shuffle",
  "/boost",
  "/settings",
] as const;

export type MainTabHref = (typeof MAIN_TAB_HREFS)[number];

const MAIN_TAB_SET = new Set<string>(MAIN_TAB_HREFS);

export function isMainTabHref(pathname: string): pathname is MainTabHref {
  return MAIN_TAB_SET.has(pathname);
}

export function readBrowserPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}
