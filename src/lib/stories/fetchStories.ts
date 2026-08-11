import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  fetchProfileStoryIdentity,
  isInvalidPublicStoryUsername,
} from "@/lib/stories/storyAuthor";
import {
  applyViewedCacheToStory,
  isOwnerGroupSnapshotComplete,
  isStoryUnseenForViewer,
} from "@/lib/stories/storyViewedCache";

import {
  selectStoriesForIndex,
  shouldKeepScanningStoryFallback,
} from "@/lib/stories/selectStoriesForIndex";
import type { StoryItem, StoryUserGroup } from "./types";

function tsToMs(value: unknown) {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function parseStoryDoc(docSnap: { id: string; data: () => unknown }, now: number) {
  const data = (docSnap.data() || {}) as Record<string, unknown>;

  if (data.adminDeleted === true || data.active === false) return null;

  const expiresAtMs = tsToMs(data.expiresAt);
  if (expiresAtMs > 0 && expiresAtMs <= now) return null;

  const ownerUid = String(data.ownerUid || "");
  if (!ownerUid) return null;

  const item: StoryItem = {
    id: docSnap.id,
    ownerUid,
    ownerUsername: String(data.ownerUsername || ""),
    ownerPhoto: String(data.ownerPhoto || ""),
    isAnonymousStory: data.isAnonymousStory === true || ownerUid.startsWith("anon_"),
    anonSessionId: String(data.anonSessionId || ""),
    texto: String(data.texto || ""),
    mediaUrl: String(data.mediaUrl || ""),
    mediaType: (data.mediaType as StoryItem["mediaType"]) || "text",
    mediaSource:
      data.mediaSource === "camera" || data.mediaSource === "gallery"
        ? data.mediaSource
        : undefined,
    createdAtMs: tsToMs(data.createdAt),
    expiresAtMs,
    likeCount: Number(data.likeCount || 0),
    viewCount: Number(data.viewCount || 0),
    durationMs: Number(data.durationMs || 0) || undefined,
    moderationRequiresBlur: data.moderationRequiresBlur === true,
    autoModerationRequiresBlur: data.autoModerationRequiresBlur === true,
    adminForceBlur: data.adminForceBlur === true,
    adminDeleted: data.adminDeleted === true,
    likedBy: (data.likedBy as Record<string, boolean>) || {},
    viewedBy: (data.viewedBy as Record<string, boolean>) || {},
    viewedByAnon: (data.viewedByAnon as Record<string, boolean>) || {},
  };

  if (!item.mediaUrl && !item.texto) return null;
  return item;
}

function computeGroupHasUnseen(
  stories: StoryItem[],
  viewerUid: string,
  ownerUid: string,
) {
  if (!viewerUid) return false;

  const storyIds = stories.map((story) => story.id);
  if (isOwnerGroupSnapshotComplete(viewerUid, ownerUid, storyIds)) {
    return false;
  }

  return stories.some((story) => isStoryUnseenForViewer(story, viewerUid));
}

function groupStories(stories: StoryItem[], viewerUid: string) {
  const byOwner = new Map<string, StoryItem[]>();

  for (const item of stories) {
    const list = byOwner.get(item.ownerUid) || [];
    list.push(item);
    byOwner.set(item.ownerUid, list);
  }

  const groups: StoryUserGroup[] = [];

  byOwner.forEach((ownerStories, ownerUid) => {
    ownerStories.sort((a, b) => a.createdAtMs - b.createdAtMs);

    for (const story of ownerStories) {
      applyViewedCacheToStory(story, viewerUid);
    }

    const hasUnseen = computeGroupHasUnseen(ownerStories, viewerUid, ownerUid);

    groups.push({
      ownerUid,
      ownerUsername: ownerStories[0]?.ownerUsername || ownerUid.slice(0, 8),
      ownerPhoto: ownerStories[0]?.ownerPhoto || "",
      isAnonymousStory: ownerStories[0]?.isAnonymousStory === true,
      stories: ownerStories,
      hasUnseen,
    });
  });

  groups.sort((a, b) => {
    const aMax = a.stories[a.stories.length - 1]?.createdAtMs || 0;
    const bMax = b.stories[b.stories.length - 1]?.createdAtMs || 0;
    return bMax - aMax;
  });

  return mergeGroupsByUsername(groups, viewerUid);
}

function mergeGroupsByUsername(groups: StoryUserGroup[], viewerUid: string) {
  const merged = new Map<string, StoryUserGroup>();

  for (const group of groups) {
    const key = group.isAnonymousStory
      ? `anon:${group.ownerUid}`
      : String(group.ownerUsername || group.ownerUid).trim().toLowerCase();

    if (!key) continue;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...group,
        stories: [...group.stories].sort((a, b) => a.createdAtMs - b.createdAtMs),
      });
      continue;
    }

    const stories = [...existing.stories, ...group.stories].sort(
      (a, b) => a.createdAtMs - b.createdAtMs,
    );

    const ownerUid = existing.ownerUid || group.ownerUid;

    merged.set(key, {
      ownerUid,
      ownerUsername: existing.ownerUsername || group.ownerUsername,
      ownerPhoto: existing.ownerPhoto || group.ownerPhoto,
      isAnonymousStory: existing.isAnonymousStory || group.isAnonymousStory,
      stories,
      hasUnseen: computeGroupHasUnseen(stories, viewerUid, ownerUid),
    });
  }

  return [...merged.values()].sort((a, b) => {
    const aMax = a.stories[a.stories.length - 1]?.createdAtMs || 0;
    const bMax = b.stories[b.stories.length - 1]?.createdAtMs || 0;
    return bMax - aMax;
  });
}

const STORIES_QUERY_LIMIT = 120;

async function fetchActiveStoryDocs(now: number) {
  const expiresAfter = Timestamp.fromMillis(now);

  try {
    const indexed = await getDocs(
      query(
        collection(db, "historias"),
        where("active", "==", true),
        where("expiresAt", ">", expiresAfter),
        orderBy("expiresAt", "desc"),
        limit(STORIES_QUERY_LIMIT),
      ),
    );
    return indexed;
  } catch (error) {
    console.warn("historias newest-first query failed, falling back to deterministic scan", error);
    const pageSize = 400;
    const scannedDocs: Array<{ id: string; data: () => unknown }> = [];
    let lastId = "";
    let pageCount = 0;
    let lastPageSize = pageSize;
    do {
      const pageQuery = lastId
        ? query(
            collection(db, "historias"),
            orderBy("__name__"),
            startAfter(lastId),
            limit(pageSize),
          )
        : query(collection(db, "historias"), orderBy("__name__"), limit(pageSize));
      const page = await getDocs(pageQuery);
      pageCount += 1;
      lastPageSize = page.size;
      scannedDocs.push(...page.docs);
      lastId = page.docs[page.docs.length - 1]?.id || "";
    } while (
      lastId &&
      shouldKeepScanningStoryFallback({
        pageSize,
        pageCount,
        lastPageSize,
      })
    );
    const selected = new Set(
      selectStoriesForIndex(
        scannedDocs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            active: data.active !== false,
            adminDeleted: data.adminDeleted === true,
            expiresAtMs: tsToMs(data.expiresAt),
            createdAtMs: tsToMs(data.createdAt),
          };
        }),
        { limit: STORIES_QUERY_LIMIT, now },
      ).map((row) => row.id),
    );
    const docs = scannedDocs.filter((docSnap) => selected.has(docSnap.id));
    return {
      docs,
      forEach(callback: (doc: (typeof docs)[number]) => void) {
        docs.forEach((docSnap) => callback(docSnap));
      },
    } as Awaited<ReturnType<typeof getDocs>>;
  }
}

export function applyHydratedProfiles(
  groups: StoryUserGroup[],
  profileByUid: Map<string, { username: string; photo: string }>,
) {
  let changed = false;
  const next = groups.map((group) => {
    if (group.isAnonymousStory) return group;
    const profile = profileByUid.get(group.ownerUid);
    if (!profile?.username) return group;
    changed = true;
    return {
      ...group,
      ownerUsername: profile.username,
      ownerPhoto: profile.photo || group.ownerPhoto,
      stories: group.stories.map((story) => ({
        ...story,
        ownerUsername: profile.username,
        ownerPhoto: profile.photo || story.ownerPhoto,
      })),
    };
  });
  return changed ? next : groups.slice();
}

async function hydrateRegisteredProfiles(groups: StoryUserGroup[]) {
  const registeredOwnerUids = [
    ...new Set(
      groups
        .filter(
          (group) =>
            !group.isAnonymousStory &&
            (isInvalidPublicStoryUsername(group.ownerUsername) || !group.ownerPhoto),
        )
        .map((group) => group.ownerUid),
    ),
  ];

  if (registeredOwnerUids.length === 0) return groups.slice();

  const profiles = await Promise.all(
    registeredOwnerUids.map(async (ownerUid) => {
      const profile = await fetchProfileStoryIdentity(ownerUid);
      return [ownerUid, profile] as const;
    }),
  );

  return applyHydratedProfiles(groups, new Map(profiles));
}

export { hydrateRegisteredProfiles };

export async function fetchActiveStoriesGrouped(
  viewerUid = "",
  options?: { hydrate?: boolean },
) {
  const now = Date.now();
  const snap = await fetchActiveStoryDocs(now);

  const stories: StoryItem[] = [];
  snap.forEach((docSnap) => {
    const item = parseStoryDoc(docSnap, now);
    if (item) stories.push(item);
  });

  const groups = groupStories(stories, viewerUid);
  if (options?.hydrate === false) return groups;
  return hydrateRegisteredProfiles(groups);
}
