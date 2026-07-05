"use client";

import { useSyncExternalStore } from "react";

import {
  getShuffleKeepAliveVersion,
  isShuffleKeepAliveActive,
  subscribeShuffleKeepAlive,
} from "@/lib/navigation/shuffleKeepAlive";

import ShuffleRouteContent from "./ShuffleRouteContent";

export default function ShufflePage() {
  useSyncExternalStore(
    subscribeShuffleKeepAlive,
    getShuffleKeepAliveVersion,
    getShuffleKeepAliveVersion,
  );

  if (isShuffleKeepAliveActive()) {
    return null;
  }

  return <ShuffleRouteContent />;
}
