import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  fetchProfileStoryIdentity,
  isInvalidPublicStoryUsername,
} from "@/lib/stories/storyAuthor";

import type { StoryItem, StoryUserGroup } from "./types";

function tsToMs(value: unknown) {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function parseStoryDoc(docSnap: { id: string; data: () => Record<string, unknown> }, now: number) {
  const data = docSnap.data();

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

    const hasUnseen = viewerUid
      ? ownerStories.some((story) => {
          if (viewerUid.startsWith("anon_")) {
            return !story.viewedByAnon?.[viewerUid];
          }
          return !story.viewedBy?.[viewerUid];
        })
      : true;

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

  return groups;
}

async function fetchActiveStoryDocs(now: number) {
  const expiresAfter = Timestamp.fromMillis(now);

  try {
    const indexed = await getDocs(
      query(
        collection(db, "historias"),
        where("active", "==", true),
        where("expiresAt", ">", expiresAfter),
      ),
    );
    return indexed;
  } catch (error) {
    console.warn("historias indexed query failed, falling back to full scan", error);
    return getDocs(collection(db, "historias"));
  }
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

  if (registeredOwnerUids.length === 0) return;

  const profiles = await Promise.all(
    registeredOwnerUids.map(async (ownerUid) => {
      const profile = await fetchProfileStoryIdentity(ownerUid);
      return [ownerUid, profile] as const;
    }),
  );

  const profileByUid = new Map(profiles);

  for (const group of groups) {
    if (group.isAnonymousStory) continue;

    const profile = profileByUid.get(group.ownerUid);
    if (!profile?.username) continue;

    group.ownerUsername = profile.username;
    if (profile.photo) group.ownerPhoto = profile.photo;

    for (const story of group.stories) {
      story.ownerUsername = profile.username;
      if (profile.photo) story.ownerPhoto = profile.photo;
    }
  }
}

export async function fetchActiveStoriesGrouped(viewerUid = "") {
  const now = Date.now();
  const snap = await fetchActiveStoryDocs(now);

  const stories: StoryItem[] = [];
  snap.forEach((docSnap) => {
    const item = parseStoryDoc(docSnap, now);
    if (item) stories.push(item);
  });

  const groups = groupStories(stories, viewerUid);
  await hydrateRegisteredProfiles(groups);
  return groups;
}
