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
  const initialViewer = resolveStoryViewerId(auth.currentUser);
  const initialGroups = getCachedStoryGroups(initialViewer);
  const [groups, setGroups] = useState<StoryUserGroup[]>(() => initialGroups);
  const [viewerUid, setViewerUid] = useState(initialViewer);
  const [loading, setLoading] = useState(
    () => !hasStoriesEverHydrated() && initialGroups.length === 0,
  );

  useEffect(() => {
    let cancelled = false;
    let lastViewer = resolveStoryViewerId(auth.currentUser);

    const unsubIndex = subscribeStoriesIndex(() => {
      if (cancelled) return;
      const cached = getCachedStoryGroups(lastViewer);
      setGroups(cached);
      if (cached.length > 0) {
        markStoriesHydrated(cached.length);
        setLoading(false);
      }
    });

    setViewerUid(lastViewer);
    // Warm first frame already seeded from snapshot when available; revalidate ASAP.
    void refreshStoriesIndex(lastViewer).finally(() => {
      if (!cancelled) setLoading(false);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const nextViewerId = resolveStoryViewerId(user);
      if (nextViewerId !== lastViewer) {
        // Never show previous account's warm mosaic after switch.
        clearStoriesIndexCache();
        setGroups([]);
        setLoading(true);
        lastViewer = nextViewerId;
      }
      setViewerUid(nextViewerId);
      void refreshStoriesIndex(nextViewerId, true).finally(() => {
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

  // indexPending: cold fetch in flight with no groups yet — pages may paint a
  // stable awaiting shell. Under the no-loading contract showLoading is false
  // so "Cargando historias..." is never returned as loading.
  const indexPending = loading && groups.length === 0;

  return { groups, viewerUid, loading: showLoading, indexPending };
}
