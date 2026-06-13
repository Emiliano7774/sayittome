type LastSeenPrivacy = {
  mostrarUltimaVez?: boolean;
};

/** Default: show last seen. Users opt out with mostrarUltimaVez: false. */
export function isLastSeenPublic(profile?: LastSeenPrivacy | null) {
  return profile?.mostrarUltimaVez !== false;
}

/** Profile owners always see their own status; public profiles show last activity to everyone. */
export function canShowLastSeenToViewer(
  profile?: (LastSeenPrivacy & {
    lastActive?: string | null;
    presenceAt?: string | null;
    createdAtLabel?: string;
  }) | null,
  isOwner = false,
) {
  if (isOwner) return true;
  return Boolean(
    profile?.presenceAt ||
      profile?.lastActive ||
      profile?.createdAtLabel,
  );
}

export function stripPublicPresence<T extends {
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  showOnline?: boolean;
}>(
  profile: T,
  visible: boolean,
): T {
  if (visible) return profile;
  return {
    ...profile,
    lastActive: undefined,
    presenceAt: undefined,
    online: false,
    showOnline: false,
  };
}

/** Online for shuffle filters, badges, and counts — false when last seen is hidden. */
export function isPublicShuffleOnline(
  profile?: (LastSeenPrivacy & {
    showOnline?: boolean;
    presenceAt?: string | null;
    lastActive?: string | null;
  }) | null,
  isOnline?: (p: { presenceAt?: string | null; lastActive?: string | null }) => boolean,
) {
  if (!profile || !isLastSeenPublic(profile)) return false;
  if (profile.showOnline === true) return true;
  if (profile.showOnline === false) return false;
  if (!isOnline) return false;
  return isOnline(profile);
}
