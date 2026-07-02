import type { MainTabHref } from "@/lib/navigation/mainTabs";

const CLEAR_SHELL_EVENT = "sayittome:clear-main-tab-shell";
const OPEN_MAIN_TAB_EVENT = "sayittome:open-main-tab";

declare global {
  interface Window {
    __sayittomeActiveShellTab?: MainTabHref | null;
  }
}

export function clearMainTabShellOverlay() {
  if (typeof window === "undefined") return false;
  if (!window.__sayittomeActiveShellTab) return false;
  window.dispatchEvent(new Event(CLEAR_SHELL_EVENT));
  return true;
}

export function openMainTabFromBridge(href: MainTabHref) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_MAIN_TAB_EVENT, { detail: { href } }));
}

export { CLEAR_SHELL_EVENT, OPEN_MAIN_TAB_EVENT };
