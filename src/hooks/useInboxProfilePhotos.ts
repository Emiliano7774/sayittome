"use client";

import { useEffect, useMemo, useState } from "react";

import {
  chatTitle,
  resolveChatUsername,
  type InboxChat,
} from "@/hooks/useChatsInbox";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { getCachedProfile, setCachedProfile } from "@/lib/profile/profileCache";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";

const photoCache: Record<string, string> = {};
const blurCache: Record<string, boolean> = {};

export function useInboxProfilePhotos(chats: InboxChat[]) {
  const [photos, setPhotos] = useState<Record<string, string>>(() => ({ ...photoCache }));
  const [blurPhotos, setBlurPhotos] = useState<Record<string, boolean>>(() => ({ ...blurCache }));

  const usernames = useMemo(() => {
    return [...new Set(chats.map((chat) => resolveChatUsername(chat)).filter(Boolean))].sort();
  }, [chats]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (usernames.length === 0) {
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
          return false;
        }

        const profileCache = getCachedProfile(username);
        if (profileCache?.photo) {
          next[username] = profileCache.photo;
          nextBlur[username] = profileCache.blurPhoto;
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

      await Promise.all(
        missing.map(async (username) => {
          try {
            const profile = await fetchProfileByUsername(username);
            const photo = resolveProfilePhoto(profile);
            if (!photo) return;

            const blurPhoto = profilePhotoRequiresBlur({
              adminBlurProfilePhoto: profile?.adminBlurProfilePhoto === true,
              adminBlurFotosPerfil: profile?.adminBlurFotosPerfil === true,
              adminBlurGallery: profile?.adminBlurGallery === true,
              mediaBlurFlags: profile?.mediaBlurFlags as Record<string, boolean> | undefined,
            });

            next[username] = photo;
            nextBlur[username] = blurPhoto;
            photoCache[username] = photo;
            blurCache[username] = blurPhoto;
            setCachedProfile(username, {
              uid: String(profile?.uid || ""),
              photo,
              blurPhoto,
              lastActive: String(profile?.lastActive || ""),
              online: profile?.online === true,
            });
          } catch {
            // Ignore per-row photo failures.
          }
        }),
      );

      if (cancelled) return;

      Object.assign(photoCache, next);
      Object.assign(blurCache, nextBlur);
      setPhotos({ ...next });
      setBlurPhotos({ ...nextBlur });
    }

    void loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [chats, usernames]);

  return { photos, blurPhotos };
}

export function inboxChatPhoto(
  chat: InboxChat,
  photos: Record<string, string>,
) {
  return chat.targetPhoto || photos[resolveChatUsername(chat)] || photos[chatTitle(chat)] || "";
}

export function inboxChatBlur(
  chat: InboxChat,
  blurPhotos: Record<string, boolean>,
) {
  return blurPhotos[resolveChatUsername(chat)] === true;
}
