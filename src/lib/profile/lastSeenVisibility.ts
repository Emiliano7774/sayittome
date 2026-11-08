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
  // A cached profile can carry an older presenceAt alongside a newer
  // lastActiveAt. Use the freshest actual heartbeat, never profile edits
  // or registration dates, so public cards and their detail agree.
  const now = Date.now();
  let latestMs = 0;
  let latestStamp: string | undefined;
  for (const raw of [
    profile?.presenceAt,
    profile?.lastActive,
    profile?.lastActiveAt,
    profile?.lastSeenAt,
  ]) {
    const stamp = String(raw || "").trim();
    const ms = Date.parse(stamp);
    if (!Number.isFinite(ms) || ms > now + 30_000 || ms <= latestMs) continue;
    latestMs = ms;
    latestStamp = stamp;
  }
  return latestStamp;
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

/** Solo online deliberately excludes hidden-last-seen profiles;
 * their green badge remains visible in ordinary Shuffle. */
export function isPublicShuffleOnline(
  profile?: (LastSeenPrivacy & {
    showOnline?: boolean;
    presenceAt?: string | null;
    lastActive?: string | null;
    onlineUntilAt?: string | null;
  }) | null,
  isOnline?: (p: { presenceAt?: string | null; lastActive?: string | null; onlineUntilAt?: string | null }) => boolean,
) {
  if (!profile || !isLastSeenPublic(profile)) return false;
  if (isOnline) return isOnline(profile);
  if (profile.showOnline === true) return true;
  if (profile.showOnline === false) return false;
  return false;
}
