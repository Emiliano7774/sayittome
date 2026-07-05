"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/anonStories";
import {
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
  const initialGroups = getCachedStoryGroups();
  const [groups, setGroups] = useState<StoryUserGroup[]>(() => initialGroups);
  const [viewerUid, setViewerUid] = useState("");
  const [loading, setLoading] = useState(
    () => !hasStoriesEverHydrated() && initialGroups.length === 0,
  );

  useEffect(() => {
    let cancelled = false;

    const unsubIndex = subscribeStoriesIndex(() => {
      if (cancelled) return;
      const cached = getCachedStoryGroups();
      setGroups(cached);
      if (cached.length > 0) {
        markStoriesHydrated(cached.length);
        setLoading(false);
      }
    });

    const viewerId = resolveStoryViewerId(auth.currentUser);
    setViewerUid(viewerId);
    void refreshStoriesIndex(viewerId).finally(() => {
      if (!cancelled) setLoading(false);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const nextViewerId = resolveStoryViewerId(user);
      setViewerUid(nextViewerId);
      void refreshStoriesIndex(nextViewerId).finally(() => {
        if (!cancelled) setLoading(false);
      });
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

  return { groups, viewerUid, loading: showLoading };
}
