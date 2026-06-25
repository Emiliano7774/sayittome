type LastSeenPrivacy = {
  mostrarUltimaVez?: boolean;
};

/** Default: show last seen. Users opt out with mostrarUltimaVez: false. */
export function isLastSeenPublic(profile?: LastSeenPrivacy | null) {
  return profile?.mostrarUltimaVez !== false;
}

/** Last activity timestamp only — never registration or profile update dates. */
export function resolveProfileHeartbeat(
  profile?: {
    presenceAt?: string | null;
    lastActive?: string | null;
    lastActiveAt?: string | null;
    lastSeenAt?: string | null;
  } | null,
) {
  const stamp = String(
    profile?.presenceAt ||
      profile?.lastActive ||
      profile?.lastActiveAt ||
      profile?.lastSeenAt ||
      "",
  ).trim();
  return stamp || undefined;
}

/** Visitors need public opt-in and a heartbeat; owners only when visibility is on. */
export function canShowLastSeenToViewer(
  profile?: (LastSeenPrivacy & {
    lastActive?: string | null;
    presenceAt?: string | null;
  }) | null,
  isOwner = false,
) {
  if (!profile) return false;
  if (!isLastSeenPublic(profile)) return false;
  if (isOwner) return true;
  return Boolean(resolveProfileHeartbeat(profile));
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
