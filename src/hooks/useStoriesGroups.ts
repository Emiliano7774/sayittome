"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getStoryOwnerKey, resolveStoryViewerId, resolveStoryViewerIdReady } from "@/lib/stories/storyAuthor";
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
  // Prefer sync auth.currentUser when already restored so SoftNavigate remounts
  // can seed the viewer-keyed snapshot on the first frame.
  const initialViewer = auth.currentUser
    ? resolveStoryViewerId(auth.currentUser)
    : "";
  const initialGroups = initialViewer
    ? getCachedStoryGroups(initialViewer)
    : [];

  const [groups, setGroups] = useState<StoryUserGroup[]>(initialGroups);
  const [viewerUid, setViewerUid] = useState(initialViewer);
  const [ownerKey, setOwnerKey] = useState(() => getStoryOwnerKey());
  const [loading, setLoading] = useState(
    () => initialGroups.length === 0 && !hasStoriesEverHydrated(),
  );

  useEffect(() => {
    let cancelled = false;
    let lastViewer = initialViewer;
    let authSettled = Boolean(auth.currentUser);
    let applyGen = 0;

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
        // Only block first-ever cold paint; after hydration never trap on blank shell.
        if (!hasStoriesEverHydrated()) setLoading(true);
      }

      lastViewer = nextViewerId;
      setViewerUid(nextViewerId);
      setOwnerKey(getStoryOwnerKey());

      const cached = getCachedStoryGroups(nextViewerId);
      if (cached.length > 0) {
        setGroups(cached);
        markStoriesHydrated(cached.length);
        setLoading(false);
      }

      const gen = ++applyGen;
      void refreshStoriesIndex(nextViewerId, forceRefresh)
        .then(() => {
          if (cancelled || gen !== applyGen) return;
          setGroups(getCachedStoryGroups(nextViewerId));
        })
        .finally(() => {
          if (cancelled || gen !== applyGen) return;
          setLoading(false);
        });
    };

    void resolveStoryViewerIdReady().then((viewerId) => {
      if (cancelled) return;
      authSettled = true;
      applyViewer(viewerId, false);
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
    // initialViewer is sync from auth at mount; effect should not rebind on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showLoading = shouldShowStoriesLoading({
    loading,
    groupCount: groups.length,
  });

  // Never keep a blank pending shell after Stories has hydrated once this session.
  const indexPending =
    loading && groups.length === 0 && !hasStoriesEverHydrated();

  return { groups, viewerUid, ownerKey, loading: showLoading, indexPending };
}
