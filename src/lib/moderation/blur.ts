export type ModerationBlurSource = {
  moderationRequiresBlur?: boolean;
  adminForceBlur?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  adminDeleted?: boolean;
};

export function storyRequiresBlur(story: ModerationBlurSource) {
  if (story.adminDeleted) return false;
  return story.moderationRequiresBlur === true || story.adminForceBlur === true;
}

export function profilePhotoRequiresBlur(profile: ModerationBlurSource) {
  return (
    profile.adminBlurProfilePhoto === true || profile.adminBlurFotosPerfil === true
  );
}
