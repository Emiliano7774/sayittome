import { urlRequiresBlurFromProfile } from "@/lib/moderation/blur";
import {
  applyShuffleAdminTagOverlay,
  mergeStickyShuffleAdminTags,
} from "@/lib/shuffle/shuffleAdminTagOverlay";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type BlurSource = Pick<
  ShuffleProfile,
  "photo" | "adminBlurProfilePhoto" | "adminBlurFotosPerfil" | "adminBlurGallery" | "mediaBlurFlags" | "adminBlurAt"
>;

function blurRevisionMs(value?: string) {
  const ms = value ? Date.parse(value) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

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

export function mergeShuffleProfileModeration(
  profile: ShuffleProfile,
  existing?: ShuffleProfile | null,
): ShuffleProfile {
  const profileRevision = blurRevisionMs(profile.adminBlurAt);
  const existingRevision = blurRevisionMs(existing?.adminBlurAt);
  const keepExistingRevision = Boolean(existing && existing.uid === profile.uid && existingRevision > profileRevision);
  const authoritative = keepExistingRevision ? existing! : profile;
  const mediaBlurFlags = { ...(authoritative.mediaBlurFlags || {}) };

  const blurred = applyShuffleProfileBlurFlags(
    {
      ...profile,
      mediaBlurFlags,
      adminBlurAt: authoritative.adminBlurAt || profile.adminBlurAt,
      adminBlurProfilePhoto: authoritative.adminBlurProfilePhoto === true,
    },
    mediaBlurFlags,
  );

  if (!existing || existing.uid !== profile.uid) {
    return applyShuffleAdminTagOverlay(blurred);
  }

  return applyShuffleAdminTagOverlay(mergeStickyShuffleAdminTags(blurred, existing));
}
