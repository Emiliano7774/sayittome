import type { MainTabHref } from "@/lib/navigation/mainTabs";

const CLEAR_SHELL_EVENT = "sayittome:clear-main-tab-shell";

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

export { CLEAR_SHELL_EVENT };
