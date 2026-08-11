import { markStoriesHydrated } from "@/hooks/useStoriesReady";
import { fetchActiveStoriesGrouped, hydrateRegisteredProfiles } from "@/lib/stories/fetchStories";
import { preloadStoryGroup } from "@/lib/stories/preload";
import {
  applyViewedMarksBatch,
  isOwnerGroupSnapshotComplete,
  isStoryUnseenForViewer,
  isStoryViewedInCache,
} from "@/lib/stories/storyViewedCache";
import {
  clearStoriesSnapshot,
  didTruncateStoriesSnapshot,
  readStoriesSnapshotState,
  writeStoriesSnapshot,
} from "@/lib/stories/storiesSnapshot";
import { recordStoryIndexTiming } from "@/lib/stories/storyIndexTiming";
import {
  nextUnseenGroupAfter,
  previousSeenStateAllowed,
  shouldPublishStoriesIndex,
  shouldSkipStoriesRefresh,
} from "@/lib/stories/storiesQueryGuard";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";

function groupHasUnseen(stories: StoryItem[], viewerId: string, ownerUid?: string) {
  if (!viewerId) return false;

  const storyIds = stories.map((story) => story.id);
  if (ownerUid && isOwnerGroupSnapshotComplete(viewerId, ownerUid, storyIds)) {
    return false;
  }

  return stories.some((story) => isStoryUnseenForViewer(story, viewerId));
}

function applyViewerSeenState(story: StoryItem, viewerId: string, seen: boolean): StoryItem {
  if (!viewerId || !seen) return story;

  if (viewerId.startsWith("anon_")) {
    if (story.viewedByAnon?.[viewerId]) return story;
    return {
      ...story,
      viewedByAnon: { ...(story.viewedByAnon || {}), [viewerId]: true },
    };
  }
  if (story.viewedBy?.[viewerId]) return story;
  return {
    ...story,
    viewedBy: { ...(story.viewedBy || {}), [viewerId]: true },
  };
}

function cloneStoryWithCache(story: StoryItem, viewerId: string): StoryItem {
  if (!viewerId || !isStoryViewedInCache(viewerId, story.id)) return story;
  return applyViewerSeenState(story, viewerId, true);
}

function rewriteGroupStories(
  group: StoryUserGroup,
  viewerId: string,
  mapStory: (story: StoryItem) => StoryItem,
): StoryUserGroup {
  const stories = group.stories.map(mapStory);
  const hasUnseen = groupHasUnseen(stories, viewerId, group.ownerUid);
  if (stories.every((story, index) => story === group.stories[index]) && hasUnseen === group.hasUnseen) {
    return group;
  }
  return { ...group, stories, hasUnseen };
}

function mergeViewerSeenState(groups: StoryUserGroup[], viewerId: string) {
  if (!viewerId) return groups;
  return groups.map((group) => rewriteGroupStories(group, viewerId, (story) => cloneStoryWithCache(story, viewerId)));
}

function previousStoryWasSeen(
  previousStory: StoryItem | undefined,
  viewerId: string,
) {
  if (!previousStory) return false;
  if (!isStoryUnseenForViewer(previousStory, viewerId)) return true;
  if (viewerId.startsWith("anon_")) {
    return previousStory.viewedByAnon?.[viewerId] === true;
  }
  return previousStory.viewedBy?.[viewerId] === true;
}

function preserveViewerSeenState(
  nextGroups: StoryUserGroup[],
  previousByUid: Map<string, StoryUserGroup>,
  viewerId: string,
) {
  if (!viewerId) return nextGroups;

  const inheritIds: string[] = [];
  const completeOwners: Array<{ ownerUid: string; storyIds: string[] }> = [];

  const next = nextGroups.map((group) => {
    const previous = previousByUid.get(group.ownerUid);
    const previousByStory = new Map(
      (previous?.stories || []).map((item) => [item.id, item]),
    );
    const rewritten = rewriteGroupStories(group, viewerId, (story) => {
      if (previousStoryWasSeen(previousByStory.get(story.id), viewerId)) {
        inheritIds.push(story.id);
        return applyViewerSeenState(story, viewerId, true);
      }
      return cloneStoryWithCache(story, viewerId);
    });
    if (!rewritten.hasUnseen) {
      completeOwners.push({
        ownerUid: rewritten.ownerUid,
        storyIds: rewritten.stories.map((story) => story.id),
      });
    }
    return rewritten;
  });

  applyViewedMarksBatch(viewerId, inheritIds, completeOwners);
  return next;
}

const TTL_MS = 10 * 60_000;

let version = 0;
let lastFetch = 0;
let hasMaterialized = false;
let viewerUid = "";
let requestedViewer = "";
let fetchToken = 0;
let cachedGroups: StoryUserGroup[] = [];
let inFlight: Promise<void> | null = null;
let snapshotTruncated = false;

const byUid = new Map<string, StoryUserGroup>();
const byUsername = new Map<string, StoryUserGroup>();
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  // Mark hydrated after any successful index materialization, including empty.
  // Empty prod users otherwise re-enter cold loading UI on every Stories remount.
  markStoriesHydrated(cachedGroups.length);
  listeners.forEach((listener) => listener());
}

function rebuildLookupMaps(groups: StoryUserGroup[]) {
  byUid.clear();
  byUsername.clear();
  for (const group of groups) {
    byUid.set(group.ownerUid, group);
    if (group.ownerUsername) {
      byUsername.set(group.ownerUsername.toLowerCase(), group);
    }
  }
}

export function scheduleSpeculativeStoryPreload(groups: StoryUserGroup[] = cachedGroups) {
  if (!groups.length) return;
  const speculativeLimit = 4;
  const run = () => {
    for (let i = 0; i < Math.min(speculativeLimit, groups.length); i += 1) {
      preloadStoryGroup(groups[i], 1, { videoPreload: "metadata" });
    }
  };
  if (typeof window === "undefined") return;
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 1200 });
    return;
  }
  window.setTimeout(run, 0);
}

export async function refreshStoriesIndex(nextViewerUid = viewerUid, force = false) {
  const requestViewer = String(nextViewerUid || "");
  if (!requestViewer) return undefined;
  if (inFlight && requestViewer === requestedViewer) return inFlight;
  const viewerChanged = requestViewer !== viewerUid;
  const now = Date.now();
  if (
    !snapshotTruncated &&
    shouldSkipStoriesRefresh({
      force,
      viewerChanged,
      now,
      lastFetch,
      ttlMs: TTL_MS,
      hasMaterialized,
    })
  ) {
    return inFlight || undefined;
  }

  const requestToken = ++fetchToken;
  requestedViewer = requestViewer;
  const storeViewerAtStart = viewerUid;
  const previousByUid =
    previousSeenStateAllowed({
      requestViewer,
      storeViewer: storeViewerAtStart,
      viewerChanged,
    })
      ? new Map(byUid)
      : new Map<string, StoryUserGroup>();
  const started = Date.now();

  const live = () =>
    shouldPublishStoriesIndex({
      requestToken,
      liveToken: fetchToken,
      requestViewer,
      liveViewer: requestedViewer,
    });

  inFlight = (async () => {
    try {
      const testDelayMs =
        typeof window !== "undefined"
          ? Number(
              (window as Window & { __SAYITTOME_TEST_STORIES_INDEX_DELAY_MS?: number })
                .__SAYITTOME_TEST_STORIES_INDEX_DELAY_MS || 0,
            )
          : 0;
      if (Number.isFinite(testDelayMs) && testDelayMs > 0) {
        await new Promise((r) => setTimeout(r, testDelayMs));
      }

      const queryStarted = Date.now();
      const groups = await fetchActiveStoriesGrouped(requestViewer, { hydrate: false });
      const queryMs = Date.now() - queryStarted;
      if (!live()) return;
      viewerUid = requestViewer;
      const nextGroups = preserveViewerSeenState(groups, previousByUid, requestViewer);
      cachedGroups = nextGroups;
      rebuildLookupMaps(nextGroups);
      lastFetch = Date.now();
      hasMaterialized = true;
      snapshotTruncated = didTruncateStoriesSnapshot(nextGroups);
      writeStoriesSnapshot(requestViewer, nextGroups, { source: "network", now: lastFetch });
      recordStoryIndexTiming({ phase: "query", ms: queryMs });
      notify();
      scheduleSpeculativeStoryPreload(nextGroups);

      const hydrateStarted = Date.now();
      const hydrated = await hydrateRegisteredProfiles(nextGroups);
      if (!live()) return;
      recordStoryIndexTiming({
        phase: "hydrate",
        ms: Date.now() - hydrateStarted,
        totalMs: Date.now() - started,
      });
      cachedGroups = hydrated;
      rebuildLookupMaps(hydrated);
      writeStoriesSnapshot(requestViewer, hydrated, { source: "local" });
      notify();
      scheduleSpeculativeStoryPreload(hydrated);
    } catch (e) {
      console.error("stories index", e);
    } finally {
      if (live()) {
        inFlight = null;
      }
    }
  })();

  return inFlight;
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
  if (group) preloadStoryGroup(group, 1, { videoPreload: "metadata" });
  return group;
}

export function getStoriesIndexMaterializedState() {
  return {
    hasMaterialized,
    lastFetch,
    viewerUid,
    groupCount: cachedGroups.length,
  };
}

export function getCachedStoryGroups(viewerUidHint = "") {
  const viewer = String(viewerUidHint || viewerUid || "").trim();
  if (!viewer) return [];

  if (hasMaterialized && viewer === viewerUid) {
    cachedGroups = mergeViewerSeenState(cachedGroups, viewer);
    return cachedGroups;
  }

  const snapshot = readStoriesSnapshotState(viewer);
  if (!snapshot) {
    return [];
  }

  viewerUid = viewer;
  cachedGroups = snapshot.groups;
  snapshotTruncated = snapshot.truncated === true;
  hasMaterialized = snapshot.truncated ? snapshot.groups.length > 0 : true;
  if (!snapshot.truncated && snapshot.fetchedAtMs > 0 && lastFetch === 0) {
    lastFetch = snapshot.fetchedAtMs;
  }
  cachedGroups = mergeViewerSeenState(cachedGroups, viewer);
  rebuildLookupMaps(cachedGroups);
  markStoriesHydrated(cachedGroups.length);
  return cachedGroups;
}

/** Drop in-memory + session Stories warm state (logout / account switch). */
export function clearStoriesIndexCache() {
  fetchToken += 1;
  requestedViewer = "";
  cachedGroups = [];
  byUid.clear();
  byUsername.clear();
  lastFetch = 0;
  hasMaterialized = false;
  snapshotTruncated = false;
  viewerUid = "";
  inFlight = null;
  clearStoriesSnapshot();
  notify();
}

export function invalidateStoriesIndexAfterMutation() {
  lastFetch = 0;
  hasMaterialized = false;
  snapshotTruncated = true;
  inFlight = null;
}

export function getNextStoryGroup(currentOwnerUid: string) {
  const groups = cachedGroups;
  const index = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  if (index < 0 || index >= groups.length - 1) return null;
  return groups[index + 1] || null;
}

export function getNextUnseenStoryGroup(currentOwnerUid: string, viewerId: string) {
  return nextUnseenGroupAfter(
    cachedGroups,
    currentOwnerUid,
    viewerId,
    (group, viewer) => groupHasUnseen(group.stories, viewer, group.ownerUid),
  );
}

export function getPreviousStoryGroup(currentOwnerUid: string) {
  const groups = cachedGroups;
  const index = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  if (index <= 0) return null;
  return groups[index - 1] || null;
}

export function prefetchUpcomingStoryGroups(currentOwnerUid: string, count = 1) {
  const groups = cachedGroups;
  const index = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  if (index < 0) return;

  for (let offset = 1; offset <= count; offset += 1) {
    const upcoming = groups[index + offset];
    if (upcoming) preloadStoryGroup(upcoming, 1, { videoPreload: "metadata" });
  }
}

export function markStoryViewedLocally(
  ownerUid: string,
  storyId: string,
  viewerId: string,
) {
  markStoriesViewedLocallyBatch(ownerUid, storyId ? [storyId] : [], viewerId);
}

export function markStoriesViewedLocallyBatch(
  ownerUid: string,
  storyIds: string[],
  viewerId: string,
) {
  if (!ownerUid || !viewerId || storyIds.length === 0) return;

  const uniqueIds = [...new Set(storyIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const group =
    byUid.get(ownerUid) ||
    [...byUsername.values()].find((row) => row.ownerUid === ownerUid) ||
    null;
  const pending = uniqueIds.filter((storyId) => {
    const story = group?.stories.find((item) => item.id === storyId);
    if (story && !isStoryUnseenForViewer(story, viewerId)) return false;
    return true;
  });
  if (pending.length === 0 && group && !group.hasUnseen) return;

  const uniqueSet = new Set(uniqueIds);
  cachedGroups = cachedGroups.map((row) => {
    if (row.ownerUid !== ownerUid) return row;
    return rewriteGroupStories(row, viewerId, (story) =>
      uniqueSet.has(story.id) ? applyViewerSeenState(story, viewerId, true) : story,
    );
  });
  const nextGroup = cachedGroups.find((row) => row.ownerUid === ownerUid) || group;
  if (nextGroup) {
    rebuildLookupMaps(cachedGroups.length ? cachedGroups : [nextGroup]);
  }

  applyViewedMarksBatch(
    viewerId,
    pending.length ? pending : uniqueIds,
    nextGroup && !nextGroup.hasUnseen
      ? [{ ownerUid, storyIds: nextGroup.stories.map((story) => story.id) }]
      : undefined,
  );
  writeStoriesSnapshot(
    viewerId,
    cachedGroups.length ? cachedGroups : nextGroup ? [nextGroup] : [],
    { source: "local" },
  );
  notify();
}

export function syncStoryGroupsForViewer(groups: StoryUserGroup[], viewerId: string) {
  return mergeViewerSeenState(groups, viewerId);
}
