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

export function useStoriesGroups() {
  const [groups, setGroups] = useState<StoryUserGroup[]>(() => getCachedStoryGroups());
  const [viewerUid, setViewerUid] = useState("");
  const [loading, setLoading] = useState(() => getCachedStoryGroups().length === 0);

  useEffect(() => {
    let cancelled = false;

    const unsubIndex = subscribeStoriesIndex(() => {
      if (cancelled) return;
      const cached = getCachedStoryGroups();
      setGroups(cached);
      if (cached.length > 0) setLoading(false);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const uid = resolveStoryViewerId(user);
      setViewerUid(uid);
      void refreshStoriesIndex(uid).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubIndex();
      unsubAuth();
    };
  }, []);

  return { groups, viewerUid, loading };
}
