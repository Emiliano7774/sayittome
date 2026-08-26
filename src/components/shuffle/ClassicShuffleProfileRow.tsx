"use client";

import { memo } from "react";

import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import AdminProfileFakeButton from "@/components/profile/AdminProfileFakeButton";
import AdminProfileRoleplayButton from "@/components/profile/AdminProfileRoleplayButton";
import AdminProfileBlurPhotosButton from "@/components/profile/AdminProfileBlurPhotosButton";
import ProfileModerationTag from "@/components/profile/ProfileModerationTag";
import ShuffleModeratedIndicator from "@/components/shuffle/ShuffleModeratedIndicator";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";
import { isShuffleProfileModerated } from "@/lib/shuffle/resolveShuffleBlur";
import { storyOwnerUidFromShuffleCard } from "@/lib/shuffle/shuffleActionTargets";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ClassicShuffleProfileRow({
  profile,
  feedIndex = 0,
}: {
  profile: ShuffleProfile;
  feedIndex?: number;
}) {
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);
  const username = profile.username;
  const bio = profile.bio || "Sin descripcion.";
  const photoLoading = feedIndex < 15 ? "eager" : "lazy";

  return (
    <div
      className="relative w-full border-b border-white/10 contain-[layout_paint_style]"
      data-shuffle-card="1"
      data-card-id={shuffleProfileIdentityKey(profile) || profile.username}
    >
      <div className={`flex w-full items-center ${tokens.gapClass} ${tokens.rowPadding}`}>
        <StoryAvatarButton
          ownerUid={storyOwnerUidFromShuffleCard(profile)}
          username={username}
          photo={profile.photo}
          size={tokens.avatarSize}
          mode="delegate"
          photoLoading={photoLoading}
          blurPhoto={profile.blurPhoto}
          showOnline={profile.showOnline}
          iconSize={tokens.iconSize}
          avatarOverlay={
            isShuffleProfileModerated(profile) ? (
              <ShuffleModeratedIndicator
                profile={profile}
                variant="classic"
                placement="avatar"
                iconSize={tokens.iconSize}
              />
            ) : null
          }
        />

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
          {(profile.moderationTag === "roleplay" || profile.fakeProfileTag === "fake") ? (
            <div className="mt-1 flex flex-col items-start gap-1">
              {profile.moderationTag === "roleplay" ? (
                <ProfileModerationTag tag="roleplay" compact />
              ) : null}
              {profile.fakeProfileTag === "fake" ? (
                <ProfileModerationTag tag="fake" compact />
              ) : null}
            </div>
          ) : null}
          <p className={`mt-0.5 ${tokens.bioClass}`}>{bio}</p>
        </button>

        <div className="flex shrink-0 flex-col gap-1">
          <AdminProfileRoleplayButton
            profile={profile}
            variant="classic"
            appearance="shuffle"
          />
          <AdminProfileFakeButton
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
    a.profile.fakeProfileTag === b.profile.fakeProfileTag &&
    a.profile.blurPhoto === b.profile.blurPhoto,
);
