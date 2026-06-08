"use client";

import { memo } from "react";

import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { getClassicShuffleDensityStyle } from "@/lib/shuffle/classicDensity";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ClassicShuffleProfileRow({ profile }: { profile: ShuffleProfile }) {
  const { density } = useClassicShuffleDensity();
  const style = getClassicShuffleDensityStyle(density);
  const username = profile.username;
  const bio = profile.bio || "Sin descripcion.";

  return (
    <div className="w-full border-b border-white/10 contain-[layout_paint_style]">
      <div className={`flex w-full items-center ${style.gapClass} ${style.rowPadding}`}>
        <StoryAvatarButton
          ownerUid={profile.uid}
          username={username}
          photo={profile.photo}
          size={style.avatarSize}
          mode="delegate"
          blurPhoto={profile.blurPhoto}
          showOnline={profile.showOnline}
          iconSize={style.iconSize}
        />

        <button
          type="button"
          data-action="chat"
          data-username={username}
          className="min-w-0 flex-1 text-left transition active:scale-[0.99]"
          aria-label={`Abrir chat con ${username}`}
        >
          <h2 className={`truncate ${style.nameClass}`}>{username}</h2>
          <p className={`mt-0.5 ${style.bioClass}`}>{bio}</p>
        </button>
      </div>
    </div>
  );
}

export default memo(ClassicShuffleProfileRow);
