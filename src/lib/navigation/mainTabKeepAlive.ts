import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";
import {
  getPresentedMainTab,
  isAtomicMainTabHandoffActive,
} from "@/lib/navigation/atomicMainTabHandoff";
import {
  getShuffleDeferSourcePath,
  isShuffleExitToMainTabPending,
  isShuffleRevealDeferred,
  isShuffleSurfacePresented,
} from "@/lib/navigation/shuffleHandoffState";
import { isShuffleKeepAliveActive } from "@/lib/navigation/shuffleKeepAlive";
import {
  getMainTabToShuffleTransaction,
  isMainTabToShufflePresentationOwned,
} from "@/lib/navigation/mainTabToShuffleTransition";
import { isVisualFirstTabsEnabled } from "@/lib/perf/instantaneityFlags";
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
  if (!isVisualFirstTabsEnabled()) return;
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
  if (!isVisualFirstTabsEnabled()) return normalizePath(pathname);
  return pendingVisualTab ?? normalizePath(pathname);
}

export function syncPendingVisualTabWithPathname(pathname: string) {
  const path = normalizePath(pathname);
  if (pendingVisualTab && path === pendingVisualTab) {
    pendingVisualTab = null;
    notifyListeners();
  }
}

export function clearPendingVisualTab() {
  if (!pendingVisualTab) return;
  pendingVisualTab = null;
  notifyListeners();
}

export function isMainTabPanelVisible(pathname: string, href: MainTabHref) {
  const path = normalizePath(pathname);
  const onConcreteMainTab =
    (MAIN_TAB_HREFS as readonly string[]).includes(path) && path !== "/shuffle";

  // Shuffle→main exit latch: hide all main panels while Shuffle still owns paint.
  if (isShuffleExitToMainTabPending()) {
    return false;
  }

  // Profile (/u/...), chat threads (/chat/...), and any other non-main-tab route:
  // keep panels mounted for instant return, but never paint sticky presented /
  // pending / handoff tabs underneath in-flow pages (transparent stack / double UI).
  if (!(MAIN_TAB_HREFS as readonly string[]).includes(path)) {
    return false;
  }

  // While already on a concrete main-tab route, pathname/presented win over stale
  // main→shuffle ownership or entry defer (e.g. /stories must never paint /chats).
  if (!onConcreteMainTab && isMainTabToShufflePresentationOwned()) {
    const source = getMainTabToShuffleTransaction()?.source;
    if (source) {
      return href === (`/${source}` as MainTabHref);
    }
  }

  if (path === "/shuffle") {
    if (isShuffleSurfacePresented()) {
      return false;
    }
    if (isShuffleRevealDeferred()) {
      return getShuffleDeferSourcePath() === href;
    }
    if (isShuffleKeepAliveActive() && !isShuffleSurfacePresented()) {
      return getShuffleDeferSourcePath() === href;
    }
    return false;
  }

  if (isAtomicMainTabHandoffActive()) {
    const presented = getPresentedMainTab(pathname);
    // If handoff presented lags behind an already-routed destination, prefer route.
    if (
      onConcreteMainTab &&
      (MAIN_TAB_HREFS as readonly string[]).includes(presented) &&
      presented !== path
    ) {
      return path === href;
    }
    return presented === href;
  }

  // Entry defer must not outlive landing on a different main tab.
  if (isShuffleRevealDeferred() && !onConcreteMainTab) {
    return getShuffleDeferSourcePath() === href;
  }

  if (
    isVisualFirstTabsEnabled() &&
    pendingVisualTab === href &&
    hasMainTabBeenVisited(href)
  ) {
    return true;
  }

  const presented = getPresentedMainTab(pathname);
  if ((MAIN_TAB_HREFS as readonly string[]).includes(presented)) {
    if (onConcreteMainTab && presented !== path) {
      return path === href;
    }
    return presented === href;
  }
  return path === href;
}

export function shouldMountMainTabPanel(pathname: string, href: MainTabHref) {
  return isMainTabPanelVisible(pathname, href) || hasMainTabBeenVisited(href);
}

export function listMainTabKeepAliveHrefs() {
  return MAIN_TAB_HREFS;
}
