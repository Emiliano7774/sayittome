import { galleryRequiresBlur, urlRequiresBlurFromProfile } from "@/lib/moderation/blur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type BlurSource = Pick<
  ShuffleProfile,
  "photo" | "adminBlurProfilePhoto" | "adminBlurFotosPerfil" | "adminBlurGallery" | "mediaBlurFlags"
>;

export function resolveShuffleProfileBlurPhoto(
  profile: BlurSource,
  mediaBlurFlagsOverride?: Record<string, boolean>,
): boolean {
  const mediaBlurFlags = mediaBlurFlagsOverride ?? profile.mediaBlurFlags;

  return (
    galleryRequiresBlur({
      adminBlurProfilePhoto: profile.adminBlurProfilePhoto,
      adminBlurFotosPerfil: profile.adminBlurFotosPerfil,
      adminBlurGallery: profile.adminBlurGallery,
      mediaBlurFlags,
    }) || urlRequiresBlurFromProfile({ mediaBlurFlags }, profile.photo || "")
  );
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
  return profile.blurPhoto || profile.moderationTag === "roleplay";
}
