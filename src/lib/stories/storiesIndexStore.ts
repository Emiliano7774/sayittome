import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import { preloadStoryGroup } from "@/lib/stories/preload";
import type { StoryUserGroup } from "@/lib/stories/types";

const TTL_MS = 45_000;

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

  const now = Date.now();
  if (!force && now - lastFetch < TTL_MS && byUid.size > 0) {
    return;
  }

  loading = true;
  viewerUid = nextViewerUid;

  try {
    const groups = await fetchActiveStoriesGrouped(viewerUid);
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
  if (ownerUid && byUid.has(ownerUid)) {
    return byUid.get(ownerUid) || null;
  }

  if (username) {
    return byUsername.get(username.toLowerCase()) || null;
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
