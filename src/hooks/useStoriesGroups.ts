"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/storyAuthor";
import {
  clearStoriesIndexCache,
  getCachedStoryGroups,
  refreshStoriesIndex,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import type { StoryUserGroup } from "@/lib/stories/types";
import {
  hasStoriesEverHydrated,
  markStoriesHydrated,
  shouldShowStoriesLoading,
} from "@/hooks/useStoriesReady";

export function useStoriesGroups() {
  // Wait for authStateReady before choosing viewer. Seeding anon while Firebase
  // restores a real uid paints mosaic then clears it (visible empty flash).
  const [groups, setGroups] = useState<StoryUserGroup[]>([]);
  const [viewerUid, setViewerUid] = useState("");
  const [loading, setLoading] = useState(() => !hasStoriesEverHydrated());

  useEffect(() => {
    let cancelled = false;
    let lastViewer = "";
    let authSettled = false;

    const unsubIndex = subscribeStoriesIndex(() => {
      if (cancelled || !lastViewer) return;
      const cached = getCachedStoryGroups(lastViewer);
      setGroups(cached);
      if (cached.length > 0) {
        markStoriesHydrated(cached.length);
        setLoading(false);
      }
    });

    const applyViewer = (nextViewerId: string, forceRefresh: boolean) => {
      if (!nextViewerId || cancelled) return;

      if (lastViewer && nextViewerId !== lastViewer) {
        clearStoriesIndexCache();
        setGroups([]);
        setLoading(true);
      }

      lastViewer = nextViewerId;
      setViewerUid(nextViewerId);

      const cached = getCachedStoryGroups(nextViewerId);
      if (cached.length > 0) {
        setGroups(cached);
        markStoriesHydrated(cached.length);
        setLoading(false);
      }

      void refreshStoriesIndex(nextViewerId, forceRefresh).finally(() => {
        if (!cancelled) setLoading(false);
      });
    };

    void auth.authStateReady().then(() => {
      if (cancelled) return;
      authSettled = true;
      applyViewer(resolveStoryViewerId(auth.currentUser), false);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!authSettled) return;
      applyViewer(resolveStoryViewerId(user), true);
    });

    return () => {
      cancelled = true;
      unsubIndex();
      unsubAuth();
    };
  }, []);

  const showLoading = shouldShowStoriesLoading({
    loading,
    groupCount: groups.length,
  });

  const indexPending = loading && groups.length === 0;

  return { groups, viewerUid, loading: showLoading, indexPending };
}
