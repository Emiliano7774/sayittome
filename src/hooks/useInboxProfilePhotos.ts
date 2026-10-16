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
    return [...new Set(chats.filter((chat) => !isAnonDirectInboxChat(chat)).map((chat) => resolveChatUsername(chat)).filter(Boolean))].sort();
  }, [chats]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (pathname !== "/chats" || usernames.length === 0) {
        return;
      }

      const next: Record<string, string> = { ...photoCache };
      const nextBlur: Record<string, boolean> = { ...blurCache };

      const missing = usernames.filter((username) => {
        const cachedChat = chats.find(
          (chat) => resolveChatUsername(chat) === username && chat.targetPhoto,
        );
        if (cachedChat?.targetPhoto) {
          next[username] = cachedChat.targetPhoto;
          photoCache[username] = cachedChat.targetPhoto;
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

      if (missing.length === 0) {
        if (!cancelled) {
          setPhotos(next);
          setBlurPhotos(nextBlur);
        }
        return;
      }

      await Promise.all(missing.map((username) => fetchInboxPhotoOnce(username)));

      if (cancelled) return;

      // Another render may have finished an in-flight lookup while we awaited.
      setPhotos({ ...next, ...photoCache });
      setBlurPhotos({ ...nextBlur, ...blurCache });
    }

    void loadPhotos();

    return () => {
      cancelled = true;
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
