"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import ShuffleRouteContent from "@/app/shuffle/ShuffleRouteContent";
import {
  getShuffleKeepAliveVersion,
  isShuffleKeepAliveVisible,
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

  if (!shouldRenderShuffleKeepAliveHost(pathname)) {
    return null;
  }

  const visible = isShuffleKeepAliveVisible(pathname);

  return (
    <div
      className={visible ? undefined : "sayittome-shuffle-keepalive-frozen"}
      aria-hidden={!visible}
    >
      <ShuffleRouteContent />
    </div>
  );
}
