"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import {
  clearInstantShuffleReturn,
  getShuffleKeepAliveVersion,
  isShuffleKeepAliveVisible,
  pinShuffleKeepAlive,
  shouldRenderShuffleKeepAliveHost,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";

export default function ShuffleKeepAliveHost() {
  const pathname = usePathname();

  useSyncExternalStore(
    subscribeShuffleKeepAlive,
    getShuffleKeepAliveVersion,
    getShuffleKeepAliveVersion,
  );

  const visible = isShuffleKeepAliveVisible(pathname);

  useEffect(() => {
    pinShuffleKeepAlive();
  }, []);

  useEffect(() => {
    if (visible) {
      clearInstantShuffleReturn();
    }
  }, [visible, pathname]);

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
