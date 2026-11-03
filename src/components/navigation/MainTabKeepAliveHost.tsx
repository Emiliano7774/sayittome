"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { BoostRouteContent } from "@/app/boost/page";
import { ChatsRouteContent } from "@/app/chats/page";
import { SettingsRouteContent } from "@/app/settings/page";
import { StoriesRouteContent } from "@/app/stories/page";
import {
  commitPresentedMainTabIfReady,
  forcePresentMainTabAfterStableExit,
  getAtomicMainTabHandoffVersion,
  isAtomicMainTabHandoffActive,
  onMainTabRouteChange,
  seedPresentedMainTab,
  subscribeAtomicMainTabHandoff,
} from "@/lib/navigation/atomicMainTabHandoff";
import {
  isTabShellNoLoadingTransitionContractActive,
} from "@/lib/navigation/tabDestinationReadiness";
import {
  clearPendingVisualTab,
  getMainTabKeepAliveVersion,
  getPendingVisualTab,
  getIncomingBarTab,
  isMainTabPanelVisible,
  listMainTabKeepAliveHrefs,
  markMainTabVisited,
  pinMainTabKeepAlive,
  shouldMountMainTabPanel,
  shouldRenderMainTabKeepAliveHost,
  subscribeMainTabKeepAlive,
  syncIncomingBarTab,
  syncPendingVisualTabWithPathname,
} from "@/lib/navigation/mainTabKeepAlive";
import { restoreNonMainRouteShellAfterShuffleReveal } from "@/lib/navigation/nonMainToShuffleReveal";
import {
  clearShuffleExitToMainTab,
  clearStaleShuffleEntryHandoffForMainTabDestination,
  getShuffleDeferSourcePath,
  getShuffleHandoffVersion,
  isShuffleExitToMainTabPending,
  isShuffleRevealDeferred,
  subscribeShuffleHandoffState,
} from "@/lib/navigation/shuffleHandoffState";
import {
  getMainTabToShuffleTransaction,
  isInternalMainTabToShuffleTransitionActive,
  isMainTabToShufflePresentationOwned,
} from "@/lib/navigation/mainTabToShuffleTransition";
import {
  getShuffleKeepAliveVersion,
  releaseShuffleTabSurface,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  getCurrentMainTabPathname,
  getMainTabInternalPathnameVersion,
  hasMainTabHistoryPathnameOverride,
  resetMainTabHistoryPathnameStore,
  subscribeMainTabPathname,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";
import {
  classifyAppRouteKind,
  isNonMainRoute,
} from "@/lib/navigation/routeKind";
import { neutralizeMainTabPresentationForNonMainRoute } from "@/lib/navigation/nonMainRouteMainTabIsolation";
import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";
import { chatsPipelineMark } from "@/lib/perf/chatsPipelineTrace";
import { scheduleStuckTabSurfaceReconcile } from "@/lib/navigation/stuckTabSurfaceReconcile";
import { settingsPipelineMark } from "@/lib/perf/settingsPipelineTrace";

const PANELS: Record<Exclude<MainTabHref, "/shuffle">, ComponentType> = {
  "/stories": StoriesRouteContent,
  "/chats": ChatsRouteContent,
  "/boost": BoostRouteContent,
  "/settings": SettingsRouteContent,
};

const HANDOFF_FRAME_BUDGET = 120;
const NO_LOADING_HANDOFF_FRAME_BUDGET = 360;

/** Scrub leftover entry handoff CSS while /stories owns the URL.
 * The old 360-rAF watchdog kept Android WebView rendering at display rate
 * for seconds even when Stories was completely idle. Observe real changes
 * immediately, with a low-frequency fallback for missed handoff events.
 */
let storiesEntryHandoffScrubToken = 0;
let disposeStoriesEntryHandoffScrub: (() => void) | null = null;

function armStoriesEntryHandoffScrub() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  disposeStoriesEntryHandoffScrub?.();
  storiesEntryHandoffScrubToken += 1;
  const token = storiesEntryHandoffScrubToken;
  let remainingMs = 6_000;
  let visibleSince = performance.now();
  let timeoutId: number | null = null;
  let intervalId: number | null = null;
  let stopped = false;
  let observer: MutationObserver | null = null;
  let unsubscribe: (() => void) | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (intervalId !== null) window.clearInterval(intervalId);
    observer?.disconnect();
    unsubscribe?.();
    document.removeEventListener("visibilitychange", onVisibility);
    if (disposeStoriesEntryHandoffScrub === stop) {
      disposeStoriesEntryHandoffScrub = null;
    }
  };
  const scrub = () => {
    if (stopped || token !== storiesEntryHandoffScrubToken) {
      stop();
      return;
    }
    const live = window.location.pathname.split("?")[0].split("#")[0];
    if (live !== "/stories") {
      stop();
      return;
    }
    // Preserve in-progress Stories→Shuffle ownership; a late scrub used to
    // blank the slide source before the destination was ready.
    if (document.hidden || isInternalMainTabToShuffleTransitionActive()) return;
    if (isShuffleRevealDeferred() && getShuffleDeferSourcePath() === "/stories") return;
    clearStaleShuffleEntryHandoffForMainTabDestination("/stories");
  };
  const pause = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
      remainingMs = Math.max(0, remainingMs - (performance.now() - visibleSince));
    }
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
  const resume = () => {
    if (stopped || document.hidden) return;
    if (remainingMs <= 0) {
      stop();
      return;
    }
    visibleSince = performance.now();
    timeoutId = window.setTimeout(stop, remainingMs);
    // Fallback only: real module and root-class mutations scrub immediately.
    intervalId = window.setInterval(scrub, 120);
    scrub();
  };
  const onVisibility = () => {
    if (document.hidden) pause();
    else resume();
  };

  observer = new MutationObserver(scrub);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-shuffle-defer-source"],
  });
  unsubscribe = subscribeShuffleHandoffState(scrub);
  document.addEventListener("visibilitychange", onVisibility);
  disposeStoriesEntryHandoffScrub = stop;
  resume();
}

function resolveMainTabPanelPath(pathname: string) {
  const incoming = getIncomingBarTab();
  if (incoming === "/shuffle") return "/shuffle";
  if (incoming) return incoming;

  const path = pathname.split("?")[0].split("#")[0];
  const onConcreteMainTab =
    (listMainTabKeepAliveHrefs() as readonly string[]).includes(path) &&
    path !== "/shuffle";

  // Shuffle must not keep the previous bar section (usually Chats) as the
  // painted panel while its own surface is the one the user opened.
  if (path === "/shuffle") return "/shuffle";

  // Once the router is on a concrete main tab, never remap the panel path back
  // to a stale Shuffle entry source (commonly /chats).
  if (onConcreteMainTab) return path;

  // Profile / chat / other non-main routes must never remap to a sticky source
  // panel (PROFILE_ROUTE_MAIN_TAB_LEAK: Chats list under /u/[username]).
  if (isNonMainRoute(path)) return path;

  if (isMainTabToShufflePresentationOwned()) {
    const source = getMainTabToShuffleTransaction()?.source;
    if (source) return `/${source}`;
  }
  if (isShuffleRevealDeferred()) {
    const defer = getShuffleDeferSourcePath();
    if ((listMainTabKeepAliveHrefs() as readonly string[]).includes(defer)) {
      return defer;
    }
  }
  return path;
}

export default function MainTabKeepAliveHost() {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  const handoffLoopRef = useRef(0);

  const version = useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  useSyncExternalStore(
    subscribeAtomicMainTabHandoff,
    getAtomicMainTabHandoffVersion,
    getAtomicMainTabHandoffVersion,
  );

  useSyncExternalStore(
    subscribeShuffleKeepAlive,
    getShuffleKeepAliveVersion,
    getShuffleKeepAliveVersion,
  );

  useSyncExternalStore(
    subscribeShuffleHandoffState,
    getShuffleHandoffVersion,
    getShuffleHandoffVersion,
  );

  const panelPath = resolveMainTabPanelPath(pathname);

  useLayoutEffect(() => {
    // Drop stale history override once Next reports a non-main-tab route (/u/, /chat/, …).
    const nextPath = String(nextPathname || "")
      .split("?")[0]
      .split("#")[0];
    const nextIsMainTabOrShuffle =
      nextPath === "/shuffle" ||
      (MAIN_TAB_HREFS as readonly string[]).includes(nextPath);
    const livePath =
      typeof window !== "undefined"
        ? window.location.pathname.split("?")[0].split("#")[0]
        : nextPath;
    const liveIsMainTabOrShuffle =
      livePath === "/shuffle" ||
      (MAIN_TAB_HREFS as readonly string[]).includes(livePath);
    if (
      liveIsMainTabOrShuffle &&
      (typeof document === "undefined" ||
        document.documentElement.getAttribute("data-sayittome-chat-open") !== "1")
    ) {
      scheduleStuckTabSurfaceReconcile(livePath);
    }

    // Same-document main-tab commits intentionally leave Next usePathname()
    // one route behind. Preserve the history override while the *live URL* is
    // already a main tab; otherwise profile -> Chats instantly resets itself.
    if (
      hasMainTabHistoryPathnameOverride() &&
      nextPath &&
      !nextIsMainTabOrShuffle &&
      !liveIsMainTabOrShuffle
    ) {
      resetMainTabHistoryPathnameStore("keepalive-host-non-main-tab");
    }
    // PROFILE_ROUTE_MAIN_TAB_LEAK: neutralize only while the *live* URL is
    // non-main. Never use lagged Next/store pathnames alone — that can stamp
    // data-sayittome-route-kind=profile onto /stories and CSS-hide Stories.
    // Respect shuffle-reveal-from so profile→Shuffle pointerdown is not undone.
    if (
      document.documentElement.getAttribute("data-sayittome-chat-open") === "1" &&
      !isNonMainRoute(livePath)
    ) {
      document.documentElement.removeAttribute("data-sayittome-bar-target");
    } else if (isNonMainRoute(livePath)) {
      // After a history-only chat -> Shuffle return, the previous shell may
      // have a persistent [hidden] attribute. A new chat/profile route reuses
      // the same container, so restore it whenever Shuffle is NOT being
      // revealed from this non-main route right now.
      if (
        !document.documentElement.hasAttribute("data-sayittome-shuffle-reveal-from") &&
        !document.documentElement.hasAttribute("data-sayittome-shuffle-reveal-pending")
      ) {
        restoreNonMainRouteShellAfterShuffleReveal();
      }
      neutralizeMainTabPresentationForNonMainRoute(livePath);
      document.documentElement.removeAttribute("data-sayittome-bar-target");
    } else if (typeof document !== "undefined") {
      const incoming = getIncomingBarTab();
      const kindPath = livePath || nextPath || pathname;
      if (incoming && incoming !== "/shuffle") {
        document.documentElement.setAttribute("data-sayittome-route-kind", "main-tab");
        document.documentElement.setAttribute(
          "data-sayittome-bar-target",
          incoming.slice(1),
        );
        document.body.classList.remove("sayittome-shuffle-route");
        document.body.classList.remove("sayittome-shuffle-surface-active");
      } else {
      const kind = classifyAppRouteKind(kindPath);
      document.documentElement.setAttribute(
        "data-sayittome-route-kind",
        kind === "shuffle" || kindPath === "/shuffle" ? "shuffle" : "main-tab",
      );
      document.documentElement.setAttribute(
        "data-sayittome-bar-target",
        kindPath === "/shuffle" || kind === "shuffle" ? "shuffle" : kindPath.slice(1),
      );
      if (kindPath === "/shuffle" || kind === "shuffle") {
        document.documentElement.removeAttribute(
          "data-sayittome-shuffle-reveal-from",
        );
        // Keep route shell released — Shuffle page is null; keepalive owns paint.
      } else {
        restoreNonMainRouteShellAfterShuffleReveal();
      }
      }
    }

    // Drop visual-first pending tab so it cannot re-paint under /u/ or /chat/.
    const pathForPending = pathname.split("?")[0].split("#")[0];
    if (
      !(MAIN_TAB_HREFS as readonly string[]).includes(pathForPending) &&
      getPendingVisualTab()
    ) {
      clearPendingVisualTab();
    }

    syncPendingVisualTabWithPathname(pathname);

    if (shouldRenderMainTabKeepAliveHost(pathname)) {
      pinMainTabKeepAlive();
    }

    const path = pathname.split("?")[0].split("#")[0];
    const livePathForMain =
      typeof window !== "undefined"
        ? window.location.pathname.split("?")[0].split("#")[0]
        : path;
    const incomingForPresent = getIncomingBarTab();
    // Destination latch: the tapped bar section wins over a lagged live URL.
    // Otherwise a layout effect that flushes from armIncomingBarTab *before*
    // pushState can forcePresent the previous Stories/Chats panel.
    const effectivePath =
      incomingForPresent &&
      incomingForPresent !== "/shuffle" &&
      (listMainTabKeepAliveHrefs() as readonly string[]).includes(incomingForPresent)
        ? incomingForPresent
        : (listMainTabKeepAliveHrefs() as readonly string[]).includes(livePathForMain) &&
            livePathForMain !== "/shuffle"
          ? livePathForMain
          : path;
    if ((listMainTabKeepAliveHrefs() as readonly string[]).includes(effectivePath)) {
      const href = effectivePath as MainTabHref;
      // Only consume the latch once the live browser URL matches the destination.
      if (livePathForMain === href) {
        syncIncomingBarTab(href);
      }
      markMainTabVisited(href);
      seedPresentedMainTab(href);
      onMainTabRouteChange(effectivePath);
      // Concrete main tabs (especially /stories) must not keep Shuffle entry
      // leftovers that re-paint a stale /chats panel under the selected tab.
      if (href !== "/shuffle") {
        clearStaleShuffleEntryHandoffForMainTabDestination(href);
        forcePresentMainTabAfterStableExit(href);
        if (href === "/stories") {
          armStoriesEntryHandoffScrub();
        } else {
          storiesEntryHandoffScrubToken += 1;
          disposeStoriesEntryHandoffScrub?.();
        }
        if (isShuffleExitToMainTabPending()) {
          releaseShuffleTabSurface();
          clearShuffleExitToMainTab({ destination: href, force: true });
        }
      }
    }

    // Non-main routes must not run presented-tab commit loops (avoids delayed
    // setActiveTab / handoff reactivation under /u/*). Warm tabs with no
    // active handoff also skip the RAF budget — commit is a no-op until armed.
    if (
      !isNonMainRoute(path) &&
      !isNonMainRoute(livePathForMain) &&
      isAtomicMainTabHandoffActive()
    ) {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;
      let frames = 0;
      const frameBudget = isTabShellNoLoadingTransitionContractActive()
        ? NO_LOADING_HANDOFF_FRAME_BUDGET
        : HANDOFF_FRAME_BUDGET;

      const tryCommit = () => {
        if (handoffLoopRef.current !== loopId) return;
        frames += 1;
        if (commitPresentedMainTabIfReady(pathname)) return;
        if (frames < frameBudget && isAtomicMainTabHandoffActive()) {
          requestAnimationFrame(tryCommit);
        }
      };

      requestAnimationFrame(tryCommit);
    }

    if (isNavTraceEnabled()) {
      const pending = getPendingVisualTab();
      if (pending) navTraceMarkDetail("tab-visual-pending");
      for (const href of listMainTabKeepAliveHrefs()) {
        if (href === "/shuffle") continue;
        if (!isMainTabPanelVisible(panelPath, href)) continue;
        navTraceMarkDetail("tab-pin");
        navTraceMarkDetail(`tab-active-${href.slice(1)}`);
        navTraceMarkDetail("tab-panel-visible");
        if (href === "/chats") chatsPipelineMark("chats-panel-visible");
        if (href === "/settings") settingsPipelineMark("settings-panel-visible");
        break;
      }
    }
  }, [pathname, version, panelPath, nextPathname]);

  if (!shouldRenderMainTabKeepAliveHost(pathname)) {
    return null;
  }

  return (
    <>
      {listMainTabKeepAliveHrefs()
        .filter((href): href is Exclude<MainTabHref, "/shuffle"> => href !== "/shuffle")
        .map((href) => {
          const Panel = PANELS[href];
          const visible = isMainTabPanelVisible(panelPath, href);

          if (!shouldMountMainTabPanel(panelPath, href)) {
            return null;
          }

          return (
            <div
              key={href}
              id={`sayittome-main-tab-keepalive-${href.slice(1)}`}
              className={
                visible
                  ? "sayittome-main-tab-keepalive-visible"
                  : "sayittome-main-tab-keepalive-frozen"
              }
              aria-hidden={!visible}
            >
              <Panel />
            </div>
          );
        })}
    </>
  );
}

/** Re-export for existing page imports that pull from the host module. */
export { isMainTabRouteHandledByKeepAlive } from "@/lib/navigation/mainTabKeepAlive";
