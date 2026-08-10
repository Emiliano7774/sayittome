import type { StoryUserGroup } from "@/lib/stories/types";

const STORAGE_KEY = "sayittome:stories-snapshot:v1";
const MAX_GROUPS = 40;

type StoriesSnapshot = {
  viewerUid: string;
  groups: StoryUserGroup[];
  savedAtMs: number;
};

let memory: StoriesSnapshot | null = null;

function sanitizeGroups(groups: StoryUserGroup[]): StoryUserGroup[] {
  return groups.slice(0, MAX_GROUPS).map((group) => ({
    ownerUid: group.ownerUid,
    ownerUsername: group.ownerUsername,
    ownerPhoto: group.ownerPhoto,
    isAnonymousStory: group.isAnonymousStory,
    hasUnseen: group.hasUnseen,
    stories: (group.stories || []).slice(0, 20).map((story) => ({
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
    })),
  }));
}

export function readStoriesSnapshot(viewerUid: string): StoryUserGroup[] | null {
  const viewer = String(viewerUid || "").trim();
  if (!viewer) return null;

  if (memory?.viewerUid === viewer && memory.groups.length > 0) {
    return memory.groups;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoriesSnapshot;
    if (!parsed || parsed.viewerUid !== viewer) return null;
    if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) return null;
    memory = parsed;
    return parsed.groups;
  } catch {
    return null;
  }
}

export function writeStoriesSnapshot(viewerUid: string, groups: StoryUserGroup[]) {
  const viewer = String(viewerUid || "").trim();
  if (!viewer || !groups.length) return;

  const next: StoriesSnapshot = {
    viewerUid: viewer,
    groups: sanitizeGroups(groups),
    savedAtMs: Date.now(),
  };
  memory = next;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota
  }
}

export function clearStoriesSnapshot() {
  memory = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
