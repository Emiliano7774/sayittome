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

export function urlRequiresBlurFromProfile(profile: ModerationBlurSource, url: string) {
  if (!url) return false;
  const flags = profile.mediaBlurFlags;
  return flags?.[url] === true;
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
