type LastSeenPrivacy = {
  mostrarUltimaVez?: boolean;
};

/** Default: show last seen. Users opt out with mostrarUltimaVez: false. */
export function isLastSeenPublic(profile?: LastSeenPrivacy | null) {
  return profile?.mostrarUltimaVez !== false;
}

/** Profile owners always see their own status; everyone else respects privacy. */
export function canShowLastSeenToViewer(
  profile?: LastSeenPrivacy | null,
  isOwner = false,
) {
  if (isOwner) return true;
  return isLastSeenPublic(profile);
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
