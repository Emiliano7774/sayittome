import { urlRequiresBlurFromProfile } from "@/lib/moderation/blur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type BlurSource = Pick<
  ShuffleProfile,
  "photo" | "adminBlurProfilePhoto" | "adminBlurFotosPerfil" | "adminBlurGallery" | "mediaBlurFlags"
>;

/** Shuffle avatar blur: only the visible main photo with an explicit per-url flag or manual admin blur. */
export function resolveShuffleProfileBlurPhoto(
  profile: BlurSource,
  mediaBlurFlagsOverride?: Record<string, boolean>,
): boolean {
  const mediaBlurFlags = mediaBlurFlagsOverride ?? profile.mediaBlurFlags;
  const photo = String(profile.photo || "").trim();

  if (profile.adminBlurProfilePhoto === true && photo) return true;
  if (photo && urlRequiresBlurFromProfile({ mediaBlurFlags }, photo)) return true;

  return false;
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

/** Admin shuffle eye overlay: only when the avatar photo is actually blurred manually. */
export function isShuffleProfileModerated(profile: ShuffleProfile): boolean {
  return resolveShuffleProfileBlurPhoto(profile);
}
