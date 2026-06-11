const STORAGE_KEY = "sayittome_story_viewed_v1";

type ViewedMap = Record<string, true>;

function cacheKey(viewerId: string, storyId: string) {
  return `${viewerId}:${storyId}`;
}

function readMap(): ViewedMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: ViewedMap) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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
