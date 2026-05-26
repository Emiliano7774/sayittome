"use client";

import { useSyncExternalStore } from "react";

import {
  getStoryGroup,
  getStoriesIndexVersion,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";

export function useStoryStatus(ownerUid?: string, username?: string) {
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const group = getStoryGroup(ownerUid, username);

  return {
    hasActive: Boolean(group && group.stories.length > 0),
    hasUnseen: group?.hasUnseen ?? false,
    storyCount: group?.stories.length ?? 0,
    group,
    storyPath: group
      ? `/stories/${encodeURIComponent(ownerUid || group.ownerUid || username || group.ownerUsername)}`
      : null,
  };
}
