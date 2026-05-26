import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { StoryItem, StoryUserGroup } from "./types";

function tsToMs(value: unknown) {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export async function fetchActiveStoriesGrouped(viewerUid = "") {
  const now = Date.now();
  const snap = await getDocs(collection(db, "historias"));

  const byOwner = new Map<string, StoryItem[]>();

  snap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;

    if (data.adminDeleted === true || data.active === false) return;

    const expiresAtMs = tsToMs(data.expiresAt);
    if (expiresAtMs > 0 && expiresAtMs <= now) return;

    const ownerUid = String(data.ownerUid || "");
    if (!ownerUid) return;

    const item: StoryItem = {
      id: docSnap.id,
      ownerUid,
      ownerUsername: String(data.ownerUsername || ""),
      ownerPhoto: String(data.ownerPhoto || ""),
      texto: String(data.texto || ""),
      mediaUrl: String(data.mediaUrl || ""),
      mediaType: (data.mediaType as StoryItem["mediaType"]) || "text",
      createdAtMs: tsToMs(data.createdAt),
      expiresAtMs,
      likeCount: Number(data.likeCount || 0),
      viewCount: Number(data.viewCount || 0),
      durationMs: Number(data.durationMs || 0) || undefined,
      moderationRequiresBlur: data.moderationRequiresBlur === true,
      adminForceBlur: data.adminForceBlur === true,
      adminDeleted: data.adminDeleted === true,
      likedBy: (data.likedBy as Record<string, boolean>) || {},
      viewedBy: (data.viewedBy as Record<string, boolean>) || {},
    };

    if (!item.mediaUrl && !item.texto) return;

    const list = byOwner.get(ownerUid) || [];
    list.push(item);
    byOwner.set(ownerUid, list);
  });

  const groups: StoryUserGroup[] = [];

  byOwner.forEach((stories, ownerUid) => {
    stories.sort((a, b) => a.createdAtMs - b.createdAtMs);

    const hasUnseen = viewerUid
      ? stories.some((s) => !s.viewedBy?.[viewerUid])
      : true;

    groups.push({
      ownerUid,
      ownerUsername: stories[0]?.ownerUsername || ownerUid.slice(0, 8),
      ownerPhoto: stories[0]?.ownerPhoto || "",
      stories,
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
