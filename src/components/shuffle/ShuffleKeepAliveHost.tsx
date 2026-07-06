"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import { clearQueuedShuffleTriggers } from "@/lib/shuffle/shuffleClickBridge";
import {
  canShowShuffleKeepAliveSurface,
  clearInstantShuffleReturn,
  commitShuffleTabReturn,
  clearShuffleRevealDeferred,
  getShuffleKeepAliveVersion,
  isInstantShuffleReturnPending,
  isShuffleKeepAliveActive,
  pinShuffleKeepAlive,
  pinShuffleWindowWhileAway,
  shouldRenderShuffleKeepAliveHost,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import {
  getShuffleWarmReturnVersion,
  isShuffleWarmVisualReady,
  subscribeShuffleWarmReturn,
} from "@/lib/shuffle/shuffleWarmVisual";
import { ghostFrameWatchEnd, ghostFrameWatchInspect } from "@/lib/perf/ghostFrameTrace";

export default function ShuffleKeepAliveHost() {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);

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

    if (path === "/shuffle" && prev !== "/shuffle" && isShuffleKeepAliveActive()) {
      commitShuffleTabReturn();
    } else if (prev === "/shuffle" && path !== "/shuffle" && isShuffleKeepAliveActive()) {
      pinShuffleWindowWhileAway();
      clearQueuedShuffleTriggers();
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

    if (
      path === "/shuffle" &&
      isShuffleWarmVisualReady() &&
      getVisibleShuffleProfiles().length > 0
    ) {
      clearShuffleRevealDeferred();
      ghostFrameWatchInspect("shuffle-warm-ready");
      requestAnimationFrame(() => ghostFrameWatchEnd());
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
      <ShuffleRouteContent />
    </div>
  );
}
