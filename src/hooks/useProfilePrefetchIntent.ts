"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  cancelProfilePrefetch,
  scheduleProfilePrefetch,
} from "@/lib/profile/prefetchPublicProfile";

type Options = {
  enabled?: boolean;
};

/** Warm profile data only on deliberate desktop hover, never during a tap. */
export function useProfilePrefetchIntent(username: string, options: Options = {}) {
  const enabled = options.enabled !== false;
  const usernameRef = useRef(username);
  usernameRef.current = username;

  useEffect(() => {
    if (!enabled) {
      cancelProfilePrefetch(usernameRef.current);
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      cancelProfilePrefetch(usernameRef.current);
    };
  }, []);

  const onPointerEnter = useCallback((event: { pointerType: string }) => {
    // Touch pointerenter fires immediately before pointerdown. Scheduling a
    // speculative profile fetch there competes with actual navigation and
    // delays content on Android. Desktop hover remains useful.
    if (!enabled || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    scheduleProfilePrefetch(usernameRef.current);
  }, [enabled]);

  const onPointerLeave = useCallback(() => {
    cancelProfilePrefetch(usernameRef.current);
  }, []);

  // The click itself starts profile navigation and its authoritative fetch.
  // Avoid spawning a duplicate /api/profile?prefetch=1 request on pointerdown.
  return {
    onPointerEnter,
    onPointerLeave,
  };
}
