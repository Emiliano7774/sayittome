"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  cancelProfilePrefetch,
  prefetchProfileImmediately,
  scheduleProfilePrefetch,
} from "@/lib/profile/prefetchPublicProfile";

type Options = {
  enabled?: boolean;
};

/** Bind delayed hover/touch prefetch handlers to a profile target. */
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

  const onPointerEnter = useCallback(() => {
    if (!enabled) return;
    scheduleProfilePrefetch(usernameRef.current);
  }, [enabled]);

  const onPointerLeave = useCallback(() => {
    cancelProfilePrefetch(usernameRef.current);
  }, []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    prefetchProfileImmediately(usernameRef.current);
  }, [enabled]);

  return {
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
  };
}
