import {
  buildStoriesSnapshotWrite,
  didTruncateStoriesSnapshot,
  isActiveSnapshotStory,
  pickLatestStoriesSnapshot,
  selectLatestStoriesSnapshot,
  STORIES_SNAPSHOT_MAX_GROUPS,
  STORIES_SNAPSHOT_MAX_STORIES,
  type StoriesSnapshotWriteSource,
} from "./storiesQueryGuard";
import type { StoryUserGroup } from "./types";

const STORAGE_KEY = "sayittome:stories-snapshot:v1";
const LOCAL_KEY = "sayittome:stories-snapshot:v2";

type StoriesSnapshot = {
  viewerUid: string;
  groups: StoryUserGroup[];
  savedAtMs: number;
  persistedAtMs: number;
  fetchedAtMs: number;
  generation: number;
  truncated?: boolean;
};

export type { StoriesSnapshotWriteSource };

export type WriteStoriesSnapshotOptions = {
  source?: StoriesSnapshotWriteSource;
  now?: number;
  generation?: number;
};

let memory: StoriesSnapshot | null = null;

function sanitizeGroups(groups: StoryUserGroup[]): StoryUserGroup[] {
  return groups.slice(0, STORIES_SNAPSHOT_MAX_GROUPS).map((group) => ({
    ownerUid: group.ownerUid,
    ownerUsername: group.ownerUsername,
    ownerPhoto: group.ownerPhoto,
    isAnonymousStory: group.isAnonymousStory,
    hasUnseen: group.hasUnseen === true,
    stories: (group.stories || []).slice(0, STORIES_SNAPSHOT_MAX_STORIES).map((story) => ({
      id: story.id,
      ownerUid: story.ownerUid,
      ownerUsername: story.ownerUsername,
      ownerPhoto: story.ownerPhoto,
      isAnonymousStory: story.isAnonymousStory,
      anonSessionId: story.anonSessionId,
      texto: story.texto,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      mediaSource: story.mediaSource,
      createdAtMs: story.createdAtMs,
      expiresAtMs: story.expiresAtMs,
      likeCount: story.likeCount,
      viewCount: story.viewCount,
      durationMs: story.durationMs,
      moderationRequiresBlur: story.moderationRequiresBlur,
      autoModerationRequiresBlur: story.autoModerationRequiresBlur,
      adminForceBlur: story.adminForceBlur,
      adminDeleted: story.adminDeleted,
      viewedBy: story.viewedBy,
      viewedByAnon: story.viewedByAnon,
    })),
  }));
}

function dropInactive(groups: StoryUserGroup[], now = Date.now()) {
  return groups
    .map((group) => ({
      ...group,
      stories: (group.stories || []).filter((story) => isActiveSnapshotStory(story, now)),
    }))
    .filter((group) => group.stories.length > 0);
}

function persistSnapshot(next: StoriesSnapshot) {
  const accepted = selectLatestStoriesSnapshot(memory, next);
  if (!accepted) return;
  if (accepted !== next && accepted === memory) return;
  memory = accepted === next ? next : accepted;
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(memory);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // quota
  }
  try {
    window.localStorage.setItem(LOCAL_KEY, raw);
  } catch {
    // quota
  }
}

function normalizeSnapshot(parsed: Partial<StoriesSnapshot>, now = Date.now()): StoriesSnapshot | null {
  if (!parsed || !parsed.viewerUid || !Array.isArray(parsed.groups)) return null;
  const fetchedAtMs = Number(parsed.fetchedAtMs || 0);
  const savedAtMs = Number(parsed.savedAtMs || parsed.persistedAtMs || 0);
  const persistedAtMs = Number(parsed.persistedAtMs || parsed.savedAtMs || 0);
  return {
    viewerUid: String(parsed.viewerUid),
    groups: dropInactive(parsed.groups, now),
    savedAtMs,
    persistedAtMs,
    fetchedAtMs,
    generation: Number(parsed.generation || 0),
    truncated: parsed.truncated === true,
  };
}

function parseSnapshot(raw: string | null, viewer: string, now = Date.now()): StoriesSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoriesSnapshot>;
    if (!parsed || parsed.viewerUid !== viewer) return null;
    return normalizeSnapshot(parsed, now);
  } catch {
    return null;
  }
}

export type StoriesSnapshotRead = {
  groups: StoryUserGroup[];
  empty: boolean;
  truncated: boolean;
  savedAtMs: number;
  persistedAtMs: number;
  fetchedAtMs: number;
  generation: number;
};

export function readStoriesSnapshotSavedAt(viewerUid: string) {
  const viewer = String(viewerUid || "").trim();
  if (memory?.viewerUid === viewer) return Number(memory.savedAtMs || 0);
  return 0;
}

export function readStoriesSnapshotFetchedAt(viewerUid: string) {
  const viewer = String(viewerUid || "").trim();
  if (memory?.viewerUid === viewer) return Number(memory.fetchedAtMs || 0);
  return 0;
}

export function readStoriesSnapshotState(
  viewerUid: string,
  now = Date.now(),
): StoriesSnapshotRead | null {
  const viewer = String(viewerUid || "").trim();
  if (!viewer) return null;

  const fromMemory =
    memory?.viewerUid === viewer
      ? { ...memory, groups: dropInactive(memory.groups, now) }
      : null;
  const fromSession =
    typeof window !== "undefined"
      ? parseSnapshot(window.sessionStorage.getItem(STORAGE_KEY), viewer, now)
      : null;
  const fromLocal =
    typeof window !== "undefined"
      ? parseSnapshot(window.localStorage.getItem(LOCAL_KEY), viewer, now)
      : null;

  const parsed = pickLatestStoriesSnapshot([fromMemory, fromSession, fromLocal], now);
  if (!parsed) return null;
  memory = parsed;
  return {
    groups: parsed.groups,
    empty: parsed.groups.length === 0,
    truncated: parsed.truncated === true,
    savedAtMs: Number(parsed.savedAtMs || 0),
    persistedAtMs: Number(parsed.persistedAtMs || parsed.savedAtMs || 0),
    fetchedAtMs: Number(parsed.fetchedAtMs || 0),
    generation: Number(parsed.generation || 0),
  };
}

export function readStoriesSnapshot(viewerUid: string): StoryUserGroup[] | null {
  const state = readStoriesSnapshotState(viewerUid);
  if (!state) return null;
  return state.groups;
}

export function writeStoriesSnapshot(
  viewerUid: string,
  groups: StoryUserGroup[],
  options?: WriteStoriesSnapshotOptions,
) {
  const viewer = String(viewerUid || "").trim();
  if (!viewer) return;

  const now = Number(options?.now ?? Date.now());
  const source = options?.source || "network";
  const previous = memory?.viewerUid === viewer ? memory : null;
  const truncated = didTruncateStoriesSnapshot(groups);
  persistSnapshot({
    ...buildStoriesSnapshotWrite({
      viewerUid: viewer,
      groups: groups.length ? sanitizeGroups(groups) : [],
      previous,
      source,
      now,
      generation: options?.generation,
    }),
    truncated,
  });
}

export function clearStoriesSnapshot() {
  memory = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}

export function resetStoriesSnapshotForTests() {
  memory = null;
}

export function seedStoriesSnapshotMemoryForTests(next: StoriesSnapshot | null) {
  memory = next;
}

export { didTruncateStoriesSnapshot };
