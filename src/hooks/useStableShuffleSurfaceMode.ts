"use client";

import { useRef, useSyncExternalStore } from "react";
import {
  getServerShuffleTouchReleaseEpoch,
  getShuffleTouchReleaseEpoch,
  isShuffleTouchGestureActive,
  subscribeShuffleTouchRelease,
} from "@/lib/shuffle/shuffleTouchStability";

/** Don't unmount the feed for a transient loading/empty update mid-drag. */
export function useStableShuffleSurfaceMode<T extends string>(nextMode: T): T {
  useSyncExternalStore(
    subscribeShuffleTouchRelease,
    getShuffleTouchReleaseEpoch,
    getServerShuffleTouchReleaseEpoch,
  );
  const lastModeRef = useRef(nextMode);
  if (!isShuffleTouchGestureActive()) {
    lastModeRef.current = nextMode;
  }
  return isShuffleTouchGestureActive() && lastModeRef.current === "feed"
    ? lastModeRef.current
    : nextMode;
}
