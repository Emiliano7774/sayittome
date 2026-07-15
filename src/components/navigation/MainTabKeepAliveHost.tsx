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
  getAtomicMainTabHandoffVersion,
  onMainTabRouteChange,
  seedPresentedMainTab,
  subscribeAtomicMainTabHandoff,
} from "@/lib/navigation/atomicMainTabHandoff";
import { isTabShellNoLoadingTransitionContractActive } from "@/lib/navigation/tabDestinationReadiness";
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
import {
  getShuffleDeferSourcePath,
  getShuffleHandoffVersion,
  isShuffleRevealDeferred,
  subscribeShuffleHandoffState,
} from "@/lib/navigation/shuffleHandoffState";
import {
  getMainTabToShuffleTransaction,
  isMainTabToShufflePresentationOwned,
} from "@/lib/navigation/mainTabToShuffleTransition";
import {
  getShuffleKeepAliveVersion,
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

function resolveMainTabPanelPath(pathname: string) {
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
  return pathname.split("?")[0].split("#")[0];
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
    if ((listMainTabKeepAliveHrefs() as readonly string[]).includes(path)) {
      const href = path as MainTabHref;
      markMainTabVisited(href);
      seedPresentedMainTab(href);
      onMainTabRouteChange(pathname);
    }

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
      if (frames < frameBudget) {
        requestAnimationFrame(tryCommit);
      }
    };

    requestAnimationFrame(tryCommit);

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
