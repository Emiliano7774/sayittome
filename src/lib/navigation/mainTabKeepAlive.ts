import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

let keepAliveActive = false;
let keepAliveVersion = 0;
let pendingVisualTab: MainTabHref | null = null;
const visitedTabs = new Set<MainTabHref>();
const listeners = new Set<() => void>();

function notifyListeners() {
  keepAliveVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeMainTabKeepAlive(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMainTabKeepAliveVersion() {
  return keepAliveVersion;
}

export function isMainTabKeepAliveActive() {
  return keepAliveActive;
}

export function hasMainTabBeenVisited(href: MainTabHref) {
  return visitedTabs.has(href);
}

/** Mark a tab panel as visited so its keep-alive tree mounts once. */
export function markMainTabVisited(href: MainTabHref) {
  if (visitedTabs.has(href)) return;
  visitedTabs.add(href);
  notifyListeners();
}

/** Pin main-tab panels after the first in-app tab visit so switches stay mounted. */
export function pinMainTabKeepAlive() {
  if (keepAliveActive) return;
  keepAliveActive = true;
  notifyListeners();
}

export function shouldRenderMainTabKeepAliveHost(pathname: string) {
  const path = normalizePath(pathname);

  if (!keepAliveActive) {
    return (MAIN_TAB_HREFS as readonly string[]).includes(path);
  }

  if ((MAIN_TAB_HREFS as readonly string[]).includes(path)) return true;
  if (path === "/shuffle") return true;
  if (path.startsWith("/chat/")) return true;
  if (path.startsWith("/u/")) return true;
  return false;
}

/** Immediate visual target before router commits (visited tabs only). */
export function setPendingVisualTab(href: MainTabHref | null) {
  if (pendingVisualTab === href) return;
  pendingVisualTab = href;
  notifyListeners();
  if (href && isNavTraceEnabled() && hasMainTabBeenVisited(href)) {
    navTraceMarkDetail("tab-visual-pending");
    navTraceMarkDetail("tab-pin");
    navTraceMarkDetail(`tab-active-${href.slice(1)}`);
    navTraceMarkDetail("tab-panel-visible");
  }
}

export function getPendingVisualTab() {
  return pendingVisualTab;
}

export function resolveEffectiveMainTab(pathname: string) {
  return pendingVisualTab ?? normalizePath(pathname);
}

export function syncPendingVisualTabWithPathname(pathname: string) {
  const path = normalizePath(pathname);
  if (pendingVisualTab && path === pendingVisualTab) {
    pendingVisualTab = null;
    notifyListeners();
  }
}

export function isMainTabPanelVisible(pathname: string, href: MainTabHref) {
  if (pendingVisualTab === href && hasMainTabBeenVisited(href)) {
    return true;
  }
  return normalizePath(pathname) === href;
}

export function shouldMountMainTabPanel(pathname: string, href: MainTabHref) {
  return isMainTabPanelVisible(pathname, href) || hasMainTabBeenVisited(href);
}

export function listMainTabKeepAliveHrefs() {
  return MAIN_TAB_HREFS;
}
