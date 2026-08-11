"use client";

import { useSyncExternalStore } from "react";

import { getStoryViewerKey } from "@/lib/stories/storyAuthor";
import {
  getStoryGroup,
  getStoriesIndexVersion,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";

export function useStoryStatus(ownerUid?: string, username?: string) {
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const group = getStoryGroup(ownerUid, username);
  const viewerReady = Boolean(getStoryViewerKey());

  return {
    hasActive: Boolean(group && group.stories.length > 0),
    hasUnseen: viewerReady && (group?.hasUnseen ?? false),
    storyCount: group?.stories.length ?? 0,
    group,
    storyPath: group
      ? `/stories/${encodeURIComponent(ownerUid || group.ownerUid || username || group.ownerUsername)}`
      : null,
  };
}
