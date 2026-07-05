import { markStoriesHydrated } from "@/hooks/useStoriesReady";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import { preloadStoryGroup } from "@/lib/stories/preload";
import {
  applyViewedCacheToStory,
  isOwnerGroupSnapshotComplete,
  isStoryViewedInCache,
  markOwnerGroupSnapshotInCache,
  markStoryViewedInCache,
} from "@/lib/stories/storyViewedCache";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";

function storyUnseenForViewer(story: StoryItem, viewerId: string) {
  if (!viewerId) return true;
  if (isStoryViewedInCache(viewerId, story.id)) return false;
  if (viewerId.startsWith("anon_")) {
    return !story.viewedByAnon?.[viewerId];
  }
  return !story.viewedBy?.[viewerId];
}

function groupHasUnseen(stories: StoryItem[], viewerId: string, ownerUid?: string) {
  if (!viewerId) return true;

  const storyIds = stories.map((story) => story.id);
  if (ownerUid && isOwnerGroupSnapshotComplete(viewerId, ownerUid, storyIds)) {
    return false;
  }

  return stories.some((story) => storyUnseenForViewer(story, viewerId));
}

function applyViewerSeenState(story: StoryItem, viewerId: string, seen: boolean) {
  if (!viewerId || !seen) return;

  if (viewerId.startsWith("anon_")) {
    story.viewedByAnon = { ...(story.viewedByAnon || {}), [viewerId]: true };
  } else {
    story.viewedBy = { ...(story.viewedBy || {}), [viewerId]: true };
  }
}

function mergeViewerSeenState(groups: StoryUserGroup[], viewerId: string) {
  if (!viewerId) return;

  for (const group of groups) {
    for (const story of group.stories) {
      applyViewedCacheToStory(story, viewerId);
    }
    group.hasUnseen = groupHasUnseen(group.stories, viewerId, group.ownerUid);
  }
}

function preserveViewerSeenState(
  nextGroups: StoryUserGroup[],
  previousByUid: Map<string, StoryUserGroup>,
  viewerId: string,
) {
  if (!viewerId) return;

  for (const group of nextGroups) {
    const previous = previousByUid.get(group.ownerUid);
    const previousStoryIds = new Set(previous?.stories.map((item) => item.id) || []);

    if (previous && !previous.hasUnseen) {
      for (const story of group.stories) {
        if (!previousStoryIds.has(story.id)) continue;

        markStoryViewedInCache(viewerId, story.id);
        applyViewerSeenState(story, viewerId, true);
      }
    }

    for (const story of group.stories) {
      applyViewedCacheToStory(story, viewerId);

      const previousStory = previous?.stories.find((item) => item.id === story.id);
      if (!previousStory) continue;

      if (viewerId.startsWith("anon_")) {
        if (previousStory.viewedByAnon?.[viewerId]) {
          applyViewerSeenState(story, viewerId, true);
        }
      } else if (previousStory.viewedBy?.[viewerId]) {
        applyViewerSeenState(story, viewerId, true);
      }
    }

    group.hasUnseen = groupHasUnseen(group.stories, viewerId, group.ownerUid);

    if (!group.hasUnseen) {
      markOwnerGroupSnapshotInCache(
        viewerId,
        group.ownerUid,
        group.stories.map((story) => story.id),
      );
    }
  }
}

const TTL_MS = 10 * 60_000;

let version = 0;
let loading = false;
let lastFetch = 0;
let viewerUid = "";
let cachedGroups: StoryUserGroup[] = [];

const byUid = new Map<string, StoryUserGroup>();
const byUsername = new Map<string, StoryUserGroup>();
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  if (cachedGroups.length > 0) {
    markStoriesHydrated(cachedGroups.length);
  }
  listeners.forEach((listener) => listener());
}

function indexGroups(groups: StoryUserGroup[]) {
  byUid.clear();
  byUsername.clear();

  for (const group of groups) {
    byUid.set(group.ownerUid, group);
    if (group.ownerUsername) {
      byUsername.set(group.ownerUsername.toLowerCase(), group);
    }
    preloadStoryGroup(group, 1);
  }
}

export async function refreshStoriesIndex(nextViewerUid = viewerUid, force = false) {
  if (loading) return;

  const viewerChanged = String(nextViewerUid) !== String(viewerUid);
  const now = Date.now();
  if (!force && !viewerChanged && now - lastFetch < TTL_MS && byUid.size > 0) {
    return;
  }

  loading = true;
  viewerUid = nextViewerUid;
  const previousByUid = new Map(byUid);

  try {
    const groups = await fetchActiveStoriesGrouped(viewerUid);
    preserveViewerSeenState(groups, previousByUid, viewerUid);
    cachedGroups = groups;
    indexGroups(groups);
    lastFetch = Date.now();
    notify();
  } catch (e) {
    console.error("stories index", e);
  } finally {
    loading = false;
  }
}

export function getStoryGroup(ownerUid?: string, username?: string) {
  const usernameKey = String(username || "").trim().toLowerCase();

  if (usernameKey && byUsername.has(usernameKey)) {
    return byUsername.get(usernameKey) || null;
  }

  const uid = String(ownerUid || "").trim();
  if (uid && byUid.has(uid)) {
    return byUid.get(uid) || null;
  }

  return null;
}

export function getStoriesIndexVersion() {
  return version;
}

export function subscribeStoriesIndex(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prefetchOwnerStories(ownerUid?: string, username?: string) {
  const group = getStoryGroup(ownerUid, username);
  if (group) preloadStoryGroup(group, 2);
  return group;
}

export function getCachedStoryGroups() {
  return cachedGroups;
}

export function markStoryViewedLocally(
  ownerUid: string,
  storyId: string,
  viewerId: string,
) {
  if (!ownerUid || !storyId || !viewerId) return;

  markStoryViewedInCache(viewerId, storyId);

  const group = byUid.get(ownerUid);
  if (!group) {
    const byName = [...byUsername.values()].find((row) => row.ownerUid === ownerUid);
    if (!byName) return;
    const story = byName.stories.find((item) => item.id === storyId);
    if (!story) return;
    applyViewerSeenState(story, viewerId, true);
    byName.hasUnseen = groupHasUnseen(byName.stories, viewerId, ownerUid);
    if (!byName.hasUnseen) {
      markOwnerGroupSnapshotInCache(
        viewerId,
        ownerUid,
        byName.stories.map((item) => item.id),
      );
    }
    notify();
    return;
  }

  const story = group.stories.find((item) => item.id === storyId);
  if (!story) return;

  applyViewerSeenState(story, viewerId, true);
  group.hasUnseen = groupHasUnseen(group.stories, viewerId, ownerUid);
  if (!group.hasUnseen) {
    markOwnerGroupSnapshotInCache(
      viewerId,
      ownerUid,
      group.stories.map((item) => item.id),
    );
  }
  notify();
}

export function syncStoryGroupsForViewer(groups: StoryUserGroup[], viewerId: string) {
  mergeViewerSeenState(groups, viewerId);
}
