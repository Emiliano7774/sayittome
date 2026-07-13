"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import { commitPresentedMainTabIfReady, isMainTabPrimaryReady } from "@/lib/navigation/atomicMainTabHandoff";
import { clearQueuedShuffleTriggers } from "@/lib/shuffle/shuffleClickBridge";
import {
  beginShuffleExitToMainTab,
  clearShuffleExitToMainTab,
  getShuffleHandoffVersion,
  isShuffleSurfacePresented,
  subscribeShuffleHandoffState,
} from "@/lib/navigation/shuffleHandoffState";
import {
  activateShuffleTabSurface,
  canShowShuffleKeepAliveSurface,
  clearInstantShuffleReturn,
  enterColdShufflePresentation,
  getShuffleKeepAliveVersion,
  hasRestorableWarmShuffleState,
  isInstantShuffleReturnPending,
  isShuffleKeepAliveActive,
  isShuffleSourceRetainedForMainTabExit,
  isValidWarmShuffleHandoffActive,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
  prepareShuffleTabReturn,
  reconcileOrphanedShuffleHandoffDom,
  releaseShuffleTabSurface,
  shouldRenderShuffleKeepAliveHost,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  getShuffleWarmReturnVersion,
  canActivateShuffleWarmHandoff,
  observeShuffleGeometryStability,
  resetShuffleGeometryStability,
  subscribeShuffleWarmReturn,
} from "@/lib/shuffle/shuffleWarmVisual";
import { isInternalMainTabToShuffleTransitionActive } from "@/lib/navigation/mainTabToShuffleTransition";
import {
  getCurrentMainTabPathname,
  getMainTabInternalPathnameVersion,
  subscribeMainTabPathname,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";
import { ghostFrameWatchEnd, ghostFrameWatchInspect } from "@/lib/perf/ghostFrameTrace";
import { isMainTabHref, type MainTabHref } from "@/lib/navigation/mainTabs";

const HANDOFF_FRAME_BUDGET = 120;

function isMainTabPath(path: string): path is Exclude<MainTabHref, "/shuffle"> {
  return isMainTabHref(path) && path !== "/shuffle";
}

export default function ShuffleKeepAliveHost() {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  const prevPathRef = useRef(pathname);
  const handoffLoopRef = useRef(0);

  useSyncExternalStore(
    subscribeShuffleKeepAlive,
    getShuffleKeepAliveVersion,
    getShuffleKeepAliveVersion,
  );

  useSyncExternalStore(
    subscribeShuffleWarmReturn,
    getShuffleWarmReturnVersion,
    getShuffleWarmReturnVersion,
  );

  useSyncExternalStore(
    subscribeShuffleHandoffState,
    getShuffleHandoffVersion,
    getShuffleHandoffVersion,
  );

  const visible =
    canShowShuffleKeepAliveSurface(pathname) ||
    isInstantShuffleReturnPending() ||
    isShuffleSourceRetainedForMainTabExit();

  useLayoutEffect(() => {
    pinShuffleKeepAlive();
  }, []);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      const path = pathname.split("?")[0].split("#")[0];
      if (path !== "/shuffle") return;
      if (isValidWarmShuffleHandoffActive()) return;
      enterColdShufflePresentation();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [pathname]);

  useLayoutEffect(() => {
    const path = pathname.split("?")[0].split("#")[0];
    const prev = prevPathRef.current.split("?")[0].split("#")[0];
    prevPathRef.current = pathname;

    if (path === "/shuffle") {
      pinShuffleKeepAlive();
      restorePinnedShuffleWindowSync();
    }

    function startHandoffLoop() {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;
      let frames = 0;

      const tryActivate = () => {
        if (handoffLoopRef.current !== loopId) return;
        frames += 1;

        restorePinnedShuffleWindowSync();

        if (!isValidWarmShuffleHandoffActive()) {
          if (hasRestorableWarmShuffleState()) {
            prepareShuffleTabReturn();
          }
          return;
        }

        if (canActivateShuffleWarmHandoff()) {
          activateShuffleTabSurface();
          requestAnimationFrame(() => ghostFrameWatchEnd());
          return;
        }

        const stable = observeShuffleGeometryStability();
        ghostFrameWatchInspect(stable ? "shuffle-geometry-stable" : `shuffle-geometry-wait:${frames}`);

        if (stable && canActivateShuffleWarmHandoff()) {
          activateShuffleTabSurface();
          requestAnimationFrame(() => ghostFrameWatchEnd());
          return;
        }

        if (frames < HANDOFF_FRAME_BUDGET) {
          requestAnimationFrame(tryActivate);
        }
      };

      requestAnimationFrame(tryActivate);
    }

    if (path === "/shuffle" && isShuffleKeepAliveActive()) {
      if (isInternalMainTabToShuffleTransitionActive()) {
        return;
      }

      const warmHandoff = isValidWarmShuffleHandoffActive();

      if (!isShuffleSurfacePresented()) {
        if (prev !== "/shuffle") {
          if (hasRestorableWarmShuffleState()) {
            prepareShuffleTabReturn();
            startHandoffLoop();
          } else {
            enterColdShufflePresentation();
          }
        } else if (!isInstantShuffleReturnPending()) {
          if (warmHandoff) {
            startHandoffLoop();
          } else {
            enterColdShufflePresentation();
          }
        }
      } else {
        reconcileOrphanedShuffleHandoffDom();
      }
    } else if (prev === "/shuffle" && path !== "/shuffle" && isShuffleKeepAliveActive()) {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;

      if (isMainTabPath(path)) {
        beginShuffleExitToMainTab(path);
        let frames = 0;
        let cancelled = false;

        const releaseWhenMainTabReady = () => {
          if (cancelled || handoffLoopRef.current !== loopId) return;
          frames += 1;

          if (isMainTabPrimaryReady(path)) {
            commitPresentedMainTabIfReady(pathname);
            releaseShuffleTabSurface();
            clearShuffleExitToMainTab();
            pinShuffleWindowWhileAway();
            clearQueuedShuffleTriggers();
            resetShuffleGeometryStability();
            return;
          }

          if (frames < HANDOFF_FRAME_BUDGET) {
            requestAnimationFrame(releaseWhenMainTabReady);
          } else {
            releaseShuffleTabSurface();
            clearShuffleExitToMainTab();
            pinShuffleWindowWhileAway();
            clearQueuedShuffleTriggers();
            resetShuffleGeometryStability();
          }
        };

        requestAnimationFrame(releaseWhenMainTabReady);
        return () => {
          cancelled = true;
        };
      }

      releaseShuffleTabSurface();
      pinShuffleWindowWhileAway();
      clearQueuedShuffleTriggers();
      resetShuffleGeometryStability();
    } else if (
      prev.startsWith("/chat/") &&
      path.startsWith("/u/") &&
      isShuffleKeepAliveActive()
    ) {
      pinShuffleWindowWhileAway();
    }

    if (path === "/shuffle" && isInstantShuffleReturnPending()) {
      requestAnimationFrame(() => clearInstantShuffleReturn());
    }
  }, [pathname]);

  if (!shouldRenderShuffleKeepAliveHost(pathname)) {
    return null;
  }

  return (
    <div
      id="sayittome-shuffle-keepalive-host"
      className={
        visible
          ? "sayittome-shuffle-keepalive-visible"
          : "sayittome-shuffle-keepalive-frozen"
      }
      aria-hidden={!visible}
    >
      <div className="sayittome-shuffle-surface-prep" data-shuffle-surface="prep">
        <ShuffleRouteContent />
      </div>
    </div>
  );
}
