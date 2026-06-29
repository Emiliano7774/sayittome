"use client";

import { memo } from "react";

import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import AdminProfileRoleplayButton from "@/components/profile/AdminProfileRoleplayButton";
import AdminProfileBlurPhotosButton from "@/components/profile/AdminProfileBlurPhotosButton";
import ShuffleModeratedIndicator from "@/components/shuffle/ShuffleModeratedIndicator";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";
import { isShuffleProfileModerated } from "@/lib/shuffle/resolveShuffleBlur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ClassicShuffleProfileRow({ profile }: { profile: ShuffleProfile }) {
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);
  const username = profile.username;
  const bio = profile.bio || "Sin descripcion.";
  const moderated = isShuffleProfileModerated(profile);

  return (
    <div
      className={[
        "relative w-full border-b border-white/10 contain-[layout_paint_style]",
        moderated ? "bg-white/[0.02]" : "",
      ].join(" ")}
    >
      <div
        className={[
          `flex w-full items-center ${tokens.gapClass} ${tokens.rowPadding}`,
          moderated ? "opacity-55 saturate-[0.45]" : "",
        ].join(" ")}
      >
        <div className="relative shrink-0">
          <StoryAvatarButton
            ownerUid={profile.uid}
            username={username}
            photo={profile.photo}
            size={tokens.avatarSize}
            mode="delegate"
            blurPhoto={profile.blurPhoto}
            showOnline={profile.showOnline}
            iconSize={tokens.iconSize}
          />
          <ShuffleModeratedIndicator profile={profile} variant="classic" />
        </div>

        <button
          type="button"
          data-action="chat"
          data-username={username}
          className="min-w-0 flex-1 text-left transition active:scale-[0.99]"
          aria-label={`Abrir chat con ${username}`}
        >
          <h2 className={`truncate ${tokens.nameClass}`}>
            {username}
            {profile.shuffleFeatured ? (
              <span className="ml-2 inline-flex align-middle rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-orange-300">
                ★
              </span>
            ) : null}
          </h2>
          <p className={`mt-0.5 ${tokens.bioClass}`}>{bio}</p>
        </button>

        <div className="flex shrink-0 flex-col gap-1">
          <AdminProfileRoleplayButton
            profile={profile}
            variant="classic"
            appearance="shuffle"
          />
          <AdminProfileBlurPhotosButton
            profile={profile}
            variant="classic"
            appearance="shuffle"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(
  ClassicShuffleProfileRow,
  (a, b) =>
    a.profile.uid === b.profile.uid &&
    a.profile.moderationTag === b.profile.moderationTag &&
    a.profile.blurPhoto === b.profile.blurPhoto,
);
