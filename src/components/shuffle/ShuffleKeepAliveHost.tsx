"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import { isMainTabPrimaryReady } from "@/lib/navigation/atomicMainTabHandoff";
import { clearQueuedShuffleTriggers } from "@/lib/shuffle/shuffleClickBridge";
import {
  isShuffleSurfacePresented,
} from "@/lib/navigation/shuffleHandoffState";
import {
  activateShuffleTabSurface,
  canShowShuffleKeepAliveSurface,
  clearInstantShuffleReturn,
  getShuffleKeepAliveVersion,
  isInstantShuffleReturnPending,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
  prepareShuffleTabReturn,
  releaseShuffleTabSurface,
  shouldRenderShuffleKeepAliveHost,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  getShuffleWarmReturnVersion,
  observeShuffleGeometryStability,
  resetShuffleGeometryStability,
  subscribeShuffleWarmReturn,
} from "@/lib/shuffle/shuffleWarmVisual";
import { ghostFrameWatchEnd, ghostFrameWatchInspect } from "@/lib/perf/ghostFrameTrace";
import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";

const HANDOFF_FRAME_BUDGET = 120;

function isMainTabPath(path: string): path is MainTabHref {
  return (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

export default function ShuffleKeepAliveHost() {
  const pathname = usePathname();
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

  const visible =
    canShowShuffleKeepAliveSurface(pathname) || isInstantShuffleReturnPending();

  useLayoutEffect(() => {
    pinShuffleKeepAlive();
  }, []);

  useLayoutEffect(() => {
    const path = pathname.split("?")[0].split("#")[0];
    const prev = prevPathRef.current.split("?")[0].split("#")[0];
    prevPathRef.current = pathname;

    if (path === "/shuffle") {
      pinShuffleKeepAlive();
    }

    function startHandoffLoop() {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;
      let frames = 0;

      const tryActivate = () => {
        if (handoffLoopRef.current !== loopId) return;
        frames += 1;

        const stable = observeShuffleGeometryStability();
        ghostFrameWatchInspect(stable ? "shuffle-geometry-stable" : `shuffle-geometry-wait:${frames}`);

        if (stable) {
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

    if (
      path === "/shuffle" &&
      isShuffleKeepAliveActive() &&
      !isShuffleSurfacePresented()
    ) {
      if (prev !== "/shuffle") {
        prepareShuffleTabReturn();
      } else if (!isInstantShuffleReturnPending()) {
        prepareShuffleTabReturn();
      }
      startHandoffLoop();
    } else if (prev === "/shuffle" && path !== "/shuffle" && isShuffleKeepAliveActive()) {
      handoffLoopRef.current += 1;
      const loopId = handoffLoopRef.current;

      if (isMainTabPath(path)) {
        let frames = 0;
        let cancelled = false;

        const releaseWhenMainTabReady = () => {
          if (cancelled || handoffLoopRef.current !== loopId) return;
          frames += 1;

          if (isMainTabPrimaryReady(path)) {
            releaseShuffleTabSurface();
            pinShuffleWindowWhileAway();
            clearQueuedShuffleTriggers();
            resetShuffleGeometryStability();
            return;
          }

          if (frames < HANDOFF_FRAME_BUDGET) {
            requestAnimationFrame(releaseWhenMainTabReady);
          } else {
            releaseShuffleTabSurface();
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
