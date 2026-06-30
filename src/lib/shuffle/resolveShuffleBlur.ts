import { urlRequiresBlurFromProfile } from "@/lib/moderation/blur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type BlurSource = Pick<
  ShuffleProfile,
  "photo" | "adminBlurProfilePhoto" | "adminBlurFotosPerfil" | "adminBlurGallery" | "mediaBlurFlags"
>;

/** Shuffle avatar blur: only the visible main photo, not whole-gallery admin flags. */
export function resolveShuffleProfileBlurPhoto(
  profile: BlurSource,
  mediaBlurFlagsOverride?: Record<string, boolean>,
): boolean {
  const mediaBlurFlags = mediaBlurFlagsOverride ?? profile.mediaBlurFlags;
  const photo = String(profile.photo || "").trim();

  if (profile.adminBlurProfilePhoto === true) return true;
  if (photo && urlRequiresBlurFromProfile({ mediaBlurFlags }, photo)) return true;

  return false;
}

export function hasExplicitMediaBlur(profile: Pick<ShuffleProfile, "mediaBlurFlags">): boolean {
  const flags = profile.mediaBlurFlags;
  if (!flags) return false;
  return Object.values(flags).some((value) => value === true);
}

export function applyShuffleProfileBlurFlags(
  profile: ShuffleProfile,
  mediaBlurFlags: Record<string, boolean>,
): ShuffleProfile {
  return {
    ...profile,
    mediaBlurFlags,
    blurPhoto: resolveShuffleProfileBlurPhoto(profile, mediaBlurFlags),
  };
}

export function isShuffleProfileModerated(profile: ShuffleProfile): boolean {
  return (
    profile.moderationTag === "roleplay" ||
    resolveShuffleProfileBlurPhoto(profile) ||
    hasExplicitMediaBlur(profile)
  );
}
