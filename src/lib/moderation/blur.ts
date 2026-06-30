export type ModerationBlurSource = {
  moderationRequiresBlur?: boolean;
  autoModerationRequiresBlur?: boolean;
  adminForceBlur?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  adminBlurStories?: boolean;
  adminBlurGallery?: boolean;
  adminBlurReason?: string;
  adminDeleted?: boolean;
  mediaBlurFlags?: Record<string, boolean>;
};

export type MessageBlurSource = {
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
};

export function storyRequiresBlur(
  story: ModerationBlurSource,
  ownerProfile?: ModerationBlurSource,
) {
  if (story.adminDeleted) return false;
  if (ownerProfile?.adminBlurStories === true) return true;
  return (
    story.moderationRequiresBlur === true ||
    story.autoModerationRequiresBlur === true ||
    story.adminForceBlur === true
  );
}

export function profilePhotoRequiresBlur(profile: ModerationBlurSource) {
  return (
    profile.adminBlurProfilePhoto === true || profile.adminBlurFotosPerfil === true
  );
}

export function galleryRequiresBlur(profile: ModerationBlurSource) {
  return profile.adminBlurGallery === true || profilePhotoRequiresBlur(profile);
}

export function messageRequiresBlur(message?: MessageBlurSource) {
  return (
    message?.autoModerationRequiresBlur === true ||
    message?.moderationRequiresBlur === true
  );
}

export function normalizeBlurMediaUrl(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return decodeURIComponent(`${parsed.origin}${parsed.pathname}`).toLowerCase();
  } catch {
    return decodeURIComponent(trimmed.split("?")[0].split("#")[0]).toLowerCase();
  }
}

export function urlRequiresBlurFromProfile(profile: ModerationBlurSource, url: string) {
  if (!url) return false;
  const flags = profile.mediaBlurFlags;
  if (!flags) return false;
  if (flags[url] === true) return true;

  const normalized = normalizeBlurMediaUrl(url);
  if (!normalized) return false;

  for (const [key, value] of Object.entries(flags)) {
    if (value !== true) continue;
    if (key === url) return true;
    if (normalizeBlurMediaUrl(key) === normalized) return true;
  }

  return false;
}

export function resolveMediaBlur(input: {
  url?: string;
  profile?: ModerationBlurSource;
  story?: ModerationBlurSource;
  message?: MessageBlurSource;
  galleryContext?: boolean;
  runtimeSensitive?: boolean;
  ownerProfile?: ModerationBlurSource;
}) {
  const { url, profile, story, message, galleryContext, runtimeSensitive, ownerProfile } =
    input;

  if (story && storyRequiresBlur(story, ownerProfile ?? profile)) return true;
  if (message && messageRequiresBlur(message)) return true;
  if (url && profile && urlRequiresBlurFromProfile(profile, url)) return true;
  if (galleryContext && profile && galleryRequiresBlur(profile)) return true;
  if (profile && profilePhotoRequiresBlur(profile)) return true;
  if (runtimeSensitive) return true;
  return false;
}
