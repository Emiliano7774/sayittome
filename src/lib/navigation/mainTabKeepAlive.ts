import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";
import { isVisualFirstTabsEnabled } from "@/lib/perf/instantaneityFlags";
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

const PIN_SESSION_KEY = "sayittome:main-tab-keepalive-pin";
const VISITED_SESSION_KEY = "sayittome:main-tab-keepalive-visited";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

let keepAliveActive = false;
let keepAliveVersion = 0;
let pendingVisualTab: MainTabHref | null = null;
/** Bar tap target painted before the URL catches up. */
let incomingBarTab: MainTabHref | null = null;
const visitedTabs = new Set<MainTabHref>();
const listeners = new Set<() => void>();
let sessionHydrated = false;

function persistKeepAliveSession() {
  if (typeof window === "undefined") return;
  try {
    if (keepAliveActive) {
      window.sessionStorage.setItem(PIN_SESSION_KEY, "1");
    }
    if (visitedTabs.size > 0) {
      window.sessionStorage.setItem(
        VISITED_SESSION_KEY,
        JSON.stringify([...visitedTabs]),
      );
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** SoftNavigate remounts wipe module locals — restore pin + visited tabs. */
function hydrateKeepAliveSession() {
  if (sessionHydrated || typeof window === "undefined") return;
  sessionHydrated = true;
  try {
    if (window.sessionStorage.getItem(PIN_SESSION_KEY) === "1") {
      keepAliveActive = true;
    }
    const raw = window.sessionStorage.getItem(VISITED_SESSION_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const href = normalizePath(String(item || ""));
      if ((MAIN_TAB_HREFS as readonly string[]).includes(href)) {
        visitedTabs.add(href as MainTabHref);
      }
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  hydrateKeepAliveSession();
}

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
  hydrateKeepAliveSession();
  return keepAliveActive;
}

export function hasMainTabBeenVisited(href: MainTabHref) {
  hydrateKeepAliveSession();
  return visitedTabs.has(href);
}

/** Mark a tab panel as visited so its keep-alive tree mounts once. */
export function markMainTabVisited(href: MainTabHref) {
  hydrateKeepAliveSession();
  if (visitedTabs.has(href)) return;
  visitedTabs.add(href);
  persistKeepAliveSession();
  notifyListeners();
}

/** Pin main-tab panels after the first in-app tab visit so switches stay mounted. */
export function pinMainTabKeepAlive() {
  hydrateKeepAliveSession();
  if (keepAliveActive) return;
  keepAliveActive = true;
  persistKeepAliveSession();
  notifyListeners();
}

export function shouldRenderMainTabKeepAliveHost(pathname: string) {
  hydrateKeepAliveSession();
  const path = normalizePath(pathname);

  if (!keepAliveActive) {
    return (MAIN_TAB_HREFS as readonly string[]).includes(path);
  }

  if ((MAIN_TAB_HREFS as readonly string[]).includes(path)) return true;
  if (path === "/shuffle") return true;
  if (path.startsWith("/chat/")) return true;
  if (path.startsWith("/u/")) return true;
  // Story viewer / compose sit on /stories/* — keep the visited Historias
  // panel mounted so swipe-down dismiss reveals the cached mosaic.
  if (path.startsWith("/stories/")) return true;
  return false;
}

/** Keep the Stories hub tree alive under a viewer so dismiss does not remount it. */
export function pinStoriesHubKeepAlive() {
  pinMainTabKeepAlive();
  markMainTabVisited("/stories");
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
  // The tapped bar section owns highlight + panel until the live URL catches up.
  if (incomingBarTab && incomingBarTab !== "/shuffle") {
    return incomingBarTab;
  }
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

/** Paint a bottom-bar section in this turn, before history and readiness gates. */
export function armIncomingBarTab(href: MainTabHref) {
  incomingBarTab = href;
  if (href !== "/shuffle") {
    pinMainTabKeepAlive();
    markMainTabVisited(href);
  }
  notifyListeners();
}

export function getIncomingBarTab() {
  return incomingBarTab;
}

export function syncIncomingBarTab(pathname: string) {
  const path = normalizePath(pathname);
  if (!incomingBarTab || path !== incomingBarTab) return;
  incomingBarTab = null;
  notifyListeners();
}

export function isMainTabPanelVisible(pathname: string, href: MainTabHref) {
  const path = normalizePath(pathname);

  if (incomingBarTab === "/shuffle") return false;
  if (incomingBarTab) {
    return href === incomingBarTab;
  }

  if (!(MAIN_TAB_HREFS as readonly string[]).includes(path)) {
    return false;
  }

  // The live bar URL owns the screen. A shuffle-exit latch must not keep Chats
  // painted over Stories, Boost, or Settings.
  if (path !== "/shuffle") {
    return path === href;
  }

  return false;
}

export function shouldMountMainTabPanel(pathname: string, href: MainTabHref) {
  return isMainTabPanelVisible(pathname, href) || hasMainTabBeenVisited(href);
}

/**
 * Suppress Next main-tab page slots when keep-alive owns paint.
 *
 * Next 16 can sync usePathname() to history.pushState while leaving the previous
 * page component mounted (StoriesPage still alive after soft-nav to /chats).
 * Requiring pathname===ownHref resurrected <StoriesRouteContent/> into
 * .sayittome-route-shell and pushed the destination keep-alive panel below the fold.
 */
export function isMainTabRouteHandledByKeepAlive(pathname: string, href: MainTabHref) {
  const path = normalizePath(pathname);
  const effective =
    incomingBarTab && incomingBarTab !== "/shuffle" ? incomingBarTab : path;

  if (!shouldRenderMainTabKeepAliveHost(path) && !shouldRenderMainTabKeepAliveHost(effective)) {
    return false;
  }

  const effectiveIsConcreteMainTab =
    (MAIN_TAB_HREFS as readonly string[]).includes(effective) &&
    effective !== "/shuffle";

  // Stale page slot: keep-alive already owns a different concrete main tab.
  if (effectiveIsConcreteMainTab && effective !== href) {
    return true;
  }

  // Own route: keep-alive mounts this panel — avoid duplicate trees/fetches.
  if (path === href || effective === href) {
    return shouldMountMainTabPanel(effective === href ? effective : path, href);
  }

  return false;
}

export function listMainTabKeepAliveHrefs() {
  return MAIN_TAB_HREFS;
}
