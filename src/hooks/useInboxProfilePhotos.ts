"use client";

import { useEffect, useMemo, useState } from "react";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";

import {
  chatTitle,
  resolveChatUsername,
  type InboxChat,
} from "@/hooks/useChatsInbox";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { isAnonDirectInboxChat } from "@/lib/anonMatch/anonDirectInboxBridge";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { getCachedProfile, setCachedProfile } from "@/lib/profile/profileCache";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";

const photoCache: Record<string, string> = {};
const blurCache: Record<string, boolean> = {};

function mergePhotoRecords<T extends string | boolean>(
  previous: Record<string, T>,
  incoming: Record<string, T>,
): Record<string, T> {
  // Live inbox snapshots frequently contain identical photo maps. Preserve
  // reference equality when nothing changed to avoid re-rendering all rows.
  for (const [key, value] of Object.entries(incoming)) {
    if (previous[key] !== value) return { ...previous, ...incoming };
  }
  return previous;
}

// Inbox snapshots can arrive in bursts (multiple query cohorts). Share photo
// work across hook re-renders instead of starting one request per render/row.
// A small global concurrency budget prevents photo lookups from starving chats.
const PHOTO_FETCH_CONCURRENCY = 3;
const photoFetchInFlight = new Map<string, Promise<void>>();
const photoFetchRetryAfter = new Map<string, number>();
const photoFetchWaiters: Array<() => void> = [];
let activePhotoFetches = 0;

async function acquirePhotoFetchSlot() {
  if (activePhotoFetches < PHOTO_FETCH_CONCURRENCY) {
    activePhotoFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => photoFetchWaiters.push(resolve));
}

function releasePhotoFetchSlot() {
  const next = photoFetchWaiters.shift();
  if (next) next();
  else activePhotoFetches = Math.max(0, activePhotoFetches - 1);
}

function fetchInboxPhotoOnce(username: string): Promise<void> {
  if (photoCache[username] || Date.now() < (photoFetchRetryAfter.get(username) || 0)) {
    return Promise.resolve();
  }
  const existing = photoFetchInFlight.get(username);
  if (existing) return existing;
  const task = (async () => {
    await acquirePhotoFetchSlot();
    try {
      // A large inbox can queue more rows than fit on screen. Do not keep
      // fetching their photos after the user opens a thread or another tab.
      if (typeof window !== "undefined" && window.location.pathname !== "/chats") return;
      // Reuse the app's existing cached profile API, never bypass its TTL.
      const profile = await fetchProfileByUsername(username);
      const photo = resolveProfilePhoto(profile);
      if (!photo) {
        photoFetchRetryAfter.set(username, Date.now() + 15 * 60_000);
        return;
      }
      const blurPhoto = profilePhotoRequiresBlur({
        adminBlurProfilePhoto: profile?.adminBlurProfilePhoto === true,
        adminBlurFotosPerfil: profile?.adminBlurFotosPerfil === true,
        adminBlurGallery: profile?.adminBlurGallery === true,
        mediaBlurFlags: profile?.mediaBlurFlags as Record<string, boolean> | undefined,
      });
      photoCache[username] = photo;
      blurCache[username] = blurPhoto;
      photoFetchRetryAfter.delete(username);
      setCachedProfile(username, {
        uid: String(profile?.uid || ""),
        photo,
        blurPhoto,
        lastActive: String(profile?.lastActive || ""),
        online: profile?.online === true,
      });
    } catch {
      // Avoid retry storms when a profile is missing or the connection fails.
      photoFetchRetryAfter.set(username, Date.now() + 60_000);
    } finally {
      releasePhotoFetchSlot();
    }
  })().finally(() => photoFetchInFlight.delete(username));
  photoFetchInFlight.set(username, task);
  return task;
}

export function useInboxProfilePhotos(chats: InboxChat[]) {
  const pathname = useEffectivePathname();
  const [photos, setPhotos] = useState<Record<string, string>>(() => ({ ...photoCache }));
  const [blurPhotos, setBlurPhotos] = useState<Record<string, boolean>>(() => ({ ...blurCache }));

  const usernames = useMemo(() => {
    // Never resolve an anonymous direct match as a public profile/photo.
    // The inbox is already ordered by recent activity. Keep that order so
    // the first visible conversations receive missing avatar requests first;
    // sorting alphabetically can starve the newest chat behind old entries.
    return [...new Set(chats.filter((chat) => !isAnonDirectInboxChat(chat)).map((chat) => resolveChatUsername(chat)).filter(Boolean))];
  }, [chats]);

  useEffect(() => {
    let cancelled = false;
    let publishTimer = 0;

    const publishAvailablePhotos = () => {
      if (cancelled || publishTimer) return;
      // Coalesce closely spaced async completions, but never wait for every
      // profile in a long inbox before displaying the first successful photo.
      publishTimer = window.setTimeout(() => {
        publishTimer = 0;
        if (cancelled) return;
        setPhotos((previous) => mergePhotoRecords(previous, photoCache));
        setBlurPhotos((previous) => mergePhotoRecords(previous, blurCache));
      }, 32);
    };

    function loadPhotos() {
      if (pathname !== "/chats" || usernames.length === 0) return;

      const next: Record<string, string> = { ...photoCache };
      const nextBlur: Record<string, boolean> = { ...blurCache };
      // One pass avoids a chats.find scan for every username (O(n²) on
      // large inboxes), while retaining the same authoritative targetPhoto.
      const targetPhotos = new Map<string, string>();
      for (const chat of chats) {
        if (isAnonDirectInboxChat(chat) || !chat.targetPhoto) continue;
        const username = resolveChatUsername(chat);
        if (username && !targetPhotos.has(username)) {
          targetPhotos.set(username, chat.targetPhoto);
        }
      }

      const missing = usernames.filter((username) => {
        const targetPhoto = targetPhotos.get(username);
        if (targetPhoto) {
          next[username] = targetPhoto;
          photoCache[username] = targetPhoto;
          return false;
        }

        const profileCache = getCachedProfile(username);
        if (profileCache?.photo) {
          next[username] = profileCache.photo;
          nextBlur[username] = profileCache.blurPhoto;
          photoCache[username] = profileCache.photo;
          blurCache[username] = profileCache.blurPhoto;
          return false;
        }

        return !next[username];
      });

      // Render known avatar data now, independently of outstanding requests.
      setPhotos((previous) => mergePhotoRecords(previous, next));
      setBlurPhotos((previous) => mergePhotoRecords(previous, nextBlur));

      // Keep the existing global three-request budget and in-flight dedupe.
      // Each completed image can appear without waiting for slower profiles.
      for (const username of missing) {
        void fetchInboxPhotoOnce(username).then(() => {
          if (!cancelled && photoCache[username]) publishAvailablePhotos();
        });
      }
    }

    loadPhotos();

    return () => {
      cancelled = true;
      if (publishTimer) window.clearTimeout(publishTimer);
    };
  }, [chats, usernames, pathname]);

  return { photos, blurPhotos };
}

export function inboxChatPhoto(
  chat: InboxChat,
  photos: Record<string, string>,
) {
  const username = resolveChatUsername(chat);
  return (
    String(chat.targetPhoto || "").trim() ||
    String(photos[username] || "").trim() ||
    String(photos[chatTitle(chat)] || "").trim() ||
    ""
  );
}

export function inboxChatBlur(
  chat: InboxChat,
  blurPhotos: Record<string, boolean>,
) {
  return blurPhotos[resolveChatUsername(chat)] === true;
}
