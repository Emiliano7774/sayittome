const STORAGE_KEY = "sayittome_story_viewed_v2";
const LEGACY_SESSION_KEY = "sayittome_story_viewed_v1";

type ViewedMap = Record<string, true | string>;

function cacheKey(viewerId: string, storyId: string) {
  return `${viewerId}:${storyId}`;
}

function ownerSnapshotKey(viewerId: string, ownerUid: string) {
  return `${viewerId}:owner:${ownerUid}`;
}

const MEM_TTL_MS = 30_000;
const MEM_CAP = 2500;

let memMap: ViewedMap | null = null;
let memAt = 0;
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

function capMap(map: ViewedMap): ViewedMap {
  const entries = Object.entries(map);
  if (entries.length <= MEM_CAP) return map;
  return Object.fromEntries(entries.slice(entries.length - MEM_CAP)) as ViewedMap;
}

function readMap(): ViewedMap {
  if (memMap && Date.now() - memAt < MEM_TTL_MS) return memMap;
  if (typeof window === "undefined") return memMap || {};

  migrateLegacyCache();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    memMap = parsed && typeof parsed === "object" ? (parsed as ViewedMap) : {};
  } catch {
    memMap = {};
  }
  memAt = Date.now();
  return memMap || {};
}

function writeMap(map: ViewedMap) {
  memMap = capMap(map);
  memAt = Date.now();
  if (typeof window === "undefined") return;

  migrateLegacyCache();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memMap));
  } catch {
    // Ignore quota errors.
  }
}

export function resetStoryViewedMemoryForTests() {
  memMap = null;
  memAt = 0;
}

export type OwnerGroupViewedMark = {
  ownerUid: string;
  storyIds: string[];
};

export function applyViewedMarksBatch(
  viewerId: string,
  storyIds: string[],
  completeOwners?: OwnerGroupViewedMark[],
) {
  if (!viewerId) return false;

  const pendingIds = new Set<string>();
  for (const storyId of storyIds) {
    if (storyId) pendingIds.add(storyId);
  }
  const owners = completeOwners || [];
  for (const owner of owners) {
    for (const storyId of owner.storyIds) {
      if (storyId) pendingIds.add(storyId);
    }
  }
  if (pendingIds.size === 0 && owners.length === 0) return false;

  const map = readMap();
  let changed = false;
  for (const storyId of pendingIds) {
    const key = cacheKey(viewerId, storyId);
    if (map[key] === true) continue;
    map[key] = true;
    changed = true;
  }
  for (const owner of owners) {
    if (!owner.ownerUid) continue;
    const snapshot = [...new Set(owner.storyIds.filter(Boolean))].sort().join(",");
    const key = ownerSnapshotKey(viewerId, owner.ownerUid);
    if (map[key] === snapshot) continue;
    map[key] = snapshot;
    changed = true;
  }
  if (changed) writeMap(map);
  return changed;
}

export function markStoryViewedInCache(viewerId: string, storyId: string) {
  return applyViewedMarksBatch(viewerId, storyId ? [storyId] : []);
}

export function markStoriesViewedInCache(
  viewerId: string,
  storyIds: string[],
  ownerUid?: string,
) {
  return applyViewedMarksBatch(
    viewerId,
    storyIds,
    ownerUid ? [{ ownerUid, storyIds }] : undefined,
  );
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
  if (!viewerId || !ownerUid || storyIds.length === 0) return false;
  return applyViewedMarksBatch(viewerId, storyIds, [{ ownerUid, storyIds }]);
}

export function isOwnerGroupSnapshotComplete(
  viewerId: string,
  ownerUid: string,
  storyIds: string[],
) {
  if (!viewerId || !ownerUid || storyIds.length === 0) return false;

  const map = readMap();
  const viewedSet = new Set<string>();
  for (const storyId of storyIds) {
    if (map[cacheKey(viewerId, storyId)] === true) viewedSet.add(storyId);
  }
  if (storyIds.every((storyId) => viewedSet.has(storyId))) {
    return true;
  }

  const snapshot = map[ownerSnapshotKey(viewerId, ownerUid)];
  if (typeof snapshot !== "string") return false;

  const seenSet = new Set(snapshot.split(",").filter(Boolean));
  return storyIds.every((storyId) => seenSet.has(storyId));
}

export function isStoryUnseenForViewer(
  story: {
    id: string;
    viewedBy?: Record<string, boolean>;
    viewedByAnon?: Record<string, boolean>;
  },
  viewerId: string,
) {
  if (!viewerId || !story.id) return false;
  if (isStoryViewedInCache(viewerId, story.id)) return false;
  if (viewerId.startsWith("anon_")) {
    return story.viewedByAnon?.[viewerId] !== true;
  }
  return story.viewedBy?.[viewerId] !== true;
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
