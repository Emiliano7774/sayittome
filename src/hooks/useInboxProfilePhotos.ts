"use client";

import { useEffect, useMemo, useState } from "react";

import {
  chatTitle,
  resolveChatUsername,
  type InboxChat,
} from "@/hooks/useChatsInbox";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";

export function useInboxProfilePhotos(chats: InboxChat[]) {
  const [photos, setPhotos] = useState<Record<string, string>>({});

  const usernames = useMemo(() => {
    return [...new Set(chats.map((chat) => resolveChatUsername(chat)).filter(Boolean))].sort();
  }, [chats]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (usernames.length === 0) {
        setPhotos({});
        return;
      }

      const entries = await Promise.all(
        usernames.map(async (username) => {
          const cached = chats.find(
            (chat) => resolveChatUsername(chat) === username && chat.targetPhoto,
          )?.targetPhoto;

          if (cached) {
            return [username, cached] as const;
          }

          try {
            const profile = await fetchProfileByUsername(username);
            return [username, resolveProfilePhoto(profile)] as const;
          } catch {
            return [username, ""] as const;
          }
        }),
      );

      if (cancelled) return;

      setPhotos(Object.fromEntries(entries.filter(([, photo]) => photo)));
    }

    void loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [chats, usernames]);

  return photos;
}

export function inboxChatPhoto(
  chat: InboxChat,
  photos: Record<string, string>,
) {
  return chat.targetPhoto || photos[resolveChatUsername(chat)] || photos[chatTitle(chat)] || "";
}
