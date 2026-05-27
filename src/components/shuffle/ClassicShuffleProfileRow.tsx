"use client";

import { memo, useSyncExternalStore } from "react";

import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ClassicShuffleProfileRow({ profile }: { profile: ShuffleProfile }) {
  const username = profile.username;
  const bio = profile.bio || "Sin descripcion.";

  return (
    <div className="w-full border-b border-white/10 contain-[layout_paint_style]">
      <div className="flex w-full items-center gap-4 py-4">
        <StoryAvatarButton
          ownerUid={profile.uid}
          username={username}
          photo={profile.photo}
          size="md"
          mode="delegate"
          blurPhoto={profile.blurPhoto}
          showOnline={profile.showOnline}
          iconSize={28}
        />

        <button
          type="button"
          data-action="chat"
          data-username={username}
          className="min-w-0 flex-1 text-left transition active:scale-[0.99]"
          aria-label={`Abrir chat con ${username}`}
        >
          <h2 className="truncate text-xl font-black">{username}</h2>
          <p className="mt-1 line-clamp-2 text-sm font-bold text-white/45">{bio}</p>
        </button>
      </div>
    </div>
  );
}

export default memo(ClassicShuffleProfileRow);
