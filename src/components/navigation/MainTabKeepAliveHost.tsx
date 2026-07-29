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
  getTabDestinationVisualReadiness,
  isTabShellNoLoadingTransitionContractActive,
} from "@/lib/navigation/tabDestinationReadiness";
import {
  clearPendingVisualTab,
  getMainTabKeepAliveVersion,
  getPendingVisualTab,
  isMainTabPanelVisible,
  listMainTabKeepAliveHrefs,
  markMainTabVisited,
  pinMainTabKeepAlive,
  shouldMountMainTabPanel,
  shouldRenderMainTabKeepAliveHost,
  subscribeMainTabKeepAlive,
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
import { settingsPipelineMark } from "@/lib/perf/settingsPipelineTrace";

const PANELS: Record<Exclude<MainTabHref, "/shuffle">, ComponentType> = {
  "/stories": StoriesRouteContent,
  "/chats": ChatsRouteContent,
  "/boost": BoostRouteContent,
  "/settings": SettingsRouteContent,
};

const HANDOFF_FRAME_BUDGET = 120;
const NO_LOADING_HANDOFF_FRAME_BUDGET = 360;

/** Scrub leftover entry handoff CSS while /stories owns the URL. */
let storiesEntryHandoffScrubToken = 0;

function armStoriesEntryHandoffScrub() {
  if (typeof window === "undefined") return;
  storiesEntryHandoffScrubToken += 1;
  const token = storiesEntryHandoffScrubToken;
  let frames = 0;
  const tick = () => {
    if (token !== storiesEntryHandoffScrubToken) return;
    const live = window.location.pathname.split("?")[0].split("#")[0];
    if (live !== "/stories") return;
    // Do not scrub while Stories→Shuffle micro-slide is arming (path still /stories).
    if (isInternalMainTabToShuffleTransitionActive()) {
      frames += 1;
      if (frames < 360) requestAnimationFrame(tick);
      return;
    }
    if (isShuffleRevealDeferred() && getShuffleDeferSourcePath() === "/stories") {
      frames += 1;
      if (frames < 360) requestAnimationFrame(tick);
      return;
    }
    clearStaleShuffleEntryHandoffForMainTabDestination("/stories");
    frames += 1;
    // Cover the Stories stay 5s gate window without becoming a permanent loop.
    if (frames < 360) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function resolveMainTabPanelPath(pathname: string) {
  const path = pathname.split("?")[0].split("#")[0];
  const onConcreteMainTab =
    (listMainTabKeepAliveHrefs() as readonly string[]).includes(path) &&
    path !== "/shuffle";

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
    if (
      hasMainTabHistoryPathnameOverride() &&
      nextPath &&
      !nextIsMainTabOrShuffle
    ) {
      resetMainTabHistoryPathnameStore("keepalive-host-non-main-tab");
    }

    const livePath =
      typeof window !== "undefined"
        ? window.location.pathname.split("?")[0].split("#")[0]
        : nextPath;
    // PROFILE_ROUTE_MAIN_TAB_LEAK: neutralize only while the *live* URL is
    // non-main. Never use lagged Next/store pathnames alone — that can stamp
    // data-sayittome-route-kind=profile onto /stories and CSS-hide Stories.
    // Respect shuffle-reveal-from so profile→Shuffle pointerdown is not undone.
    if (isNonMainRoute(livePath)) {
      neutralizeMainTabPresentationForNonMainRoute(livePath);
    } else if (typeof document !== "undefined") {
      const kindPath = livePath || nextPath || pathname;
      const kind = classifyAppRouteKind(kindPath);
      document.documentElement.setAttribute(
        "data-sayittome-route-kind",
        kind === "shuffle" || kindPath === "/shuffle" ? "shuffle" : "main-tab",
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
    // Prefer the live browser URL when keep-alive pathname lags (history sync /
    // Next usePathname desync). Otherwise Stories can stay under an exit latch.
    const effectivePath =
      (listMainTabKeepAliveHrefs() as readonly string[]).includes(livePathForMain) &&
      livePathForMain !== "/shuffle"
        ? livePathForMain
        : path;
    if ((listMainTabKeepAliveHrefs() as readonly string[]).includes(effectivePath)) {
      const href = effectivePath as MainTabHref;
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
        }
        if (isShuffleExitToMainTabPending()) {
          // Stories has no post-auth settle CSS. Force-clearing the exit latch
          // while "Cargando historias..." is still painted flashes user-visible
          // loading during Shuffle→Stories / mid-slide supersede. Let the exit
          // watchdog release once destination loading is gone.
          if (href === "/stories") {
            const visual = getTabDestinationVisualReadiness("/stories");
            const storiesHost =
              typeof document !== "undefined"
                ? document.getElementById(
                    "sayittome-main-tab-keepalive-stories",
                  )
                : null;
            const layoutLoading = storiesHost
              ? [...storiesHost.querySelectorAll("[data-nav-loading-copy]")].some(
                  (el) => {
                    const style = getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    return (
                      rect.width >= 8 &&
                      rect.height >= 8 &&
                      style.display !== "none"
                    );
                  },
                )
              : false;
            if (
              !visual.hasVisibleLoadingText &&
              !visual.hasLoadingShell &&
              !layoutLoading
            ) {
              forcePresentMainTabAfterStableExit(href);
              releaseShuffleTabSurface();
              clearShuffleExitToMainTab({ destination: href, force: true });
            }
          } else {
            clearShuffleExitToMainTab({ destination: href, force: true });
          }
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

export function isMainTabRouteHandledByKeepAlive(pathname: string, href: MainTabHref) {
  if (!shouldRenderMainTabKeepAliveHost(pathname)) return false;
  if (normalizeRoute(pathname) !== href) return false;
  return shouldMountMainTabPanel(pathname, href);
}

function normalizeRoute(pathname: string) {
  return pathname.split("?")[0].split("#")[0];
}
