const STORAGE_KEY = "sayittome_story_viewed_v2";
const LEGACY_SESSION_KEY = "sayittome_story_viewed_v1";

type ViewedMap = Record<string, true | string>;

function cacheKey(viewerId: string, storyId: string) {
  return `${viewerId}:${storyId}`;
}

function ownerSnapshotKey(viewerId: string, ownerUid: string) {
  return `${viewerId}:owner:${ownerUid}`;
}

let migrated = false;

function migrateLegacyCache() {
  if (migrated || typeof window === "undefined") return;
  migrated = true;

  try {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
}

function readMap(): ViewedMap {
  if (typeof window === "undefined") return {};

  migrateLegacyCache();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: ViewedMap) {
  if (typeof window === "undefined") return;

  migrateLegacyCache();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors.
  }
}

export function markStoryViewedInCache(viewerId: string, storyId: string) {
  if (!viewerId || !storyId) return;

  const map = readMap();
  map[cacheKey(viewerId, storyId)] = true;
  writeMap(map);
}

export function isStoryViewedInCache(viewerId: string, storyId: string) {
  if (!viewerId || !storyId) return false;
  return readMap()[cacheKey(viewerId, storyId)] === true;
}

export function markOwnerGroupSnapshotInCache(
  viewerId: string,
  ownerUid: string,
  storyIds: string[],
) {
  if (!viewerId || !ownerUid || storyIds.length === 0) return;

  const map = readMap();
  for (const storyId of storyIds) {
    map[cacheKey(viewerId, storyId)] = true;
  }
  map[ownerSnapshotKey(viewerId, ownerUid)] = storyIds.slice().sort().join(",");
  writeMap(map);
}

export function isOwnerGroupSnapshotComplete(
  viewerId: string,
  ownerUid: string,
  storyIds: string[],
) {
  if (!viewerId || !ownerUid || storyIds.length === 0) return false;

  // Individual viewed flags are authoritative — never let a stale owner snapshot
  // hide a newly published story, and never ignore per-story marks when complete.
  if (storyIds.every((storyId) => isStoryViewedInCache(viewerId, storyId))) {
    return true;
  }

  const snapshot = readMap()[ownerSnapshotKey(viewerId, ownerUid)];
  if (typeof snapshot !== "string") return false;

  const seenSet = new Set(snapshot.split(",").filter(Boolean));
  return storyIds.every((storyId) => seenSet.has(storyId));
}

export function applyViewedCacheToStory(
  story: {
    id: string;
    viewedBy?: Record<string, boolean>;
    viewedByAnon?: Record<string, boolean>;
  },
  viewerId: string,
) {
  if (!viewerId || !isStoryViewedInCache(viewerId, story.id)) return;

  if (viewerId.startsWith("anon_")) {
    story.viewedByAnon = { ...(story.viewedByAnon || {}), [viewerId]: true };
  } else {
    story.viewedBy = { ...(story.viewedBy || {}), [viewerId]: true };
  }
}
