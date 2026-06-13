import {
  canShowLastSeenToViewer,
  resolveProfileHeartbeat,
} from "@/lib/profile/lastSeenVisibility";

type ProfileLike = {
  presenceAt?: string | null;
  lastActive?: string | null;
  lastActiveAt?: string | null;
  lastSeenAt?: string | null;
  mostrarUltimaVez?: boolean;
};

export function resolveProfileLastSeenLabel(
  profile: ProfileLike | null | undefined,
  isOwner: boolean,
  formatLastSeen: (lastActive?: string | null, online?: boolean) => string,
  isOnline: boolean,
) {
  if (!profile || !canShowLastSeenToViewer(profile, isOwner)) {
    return "";
  }

  const heartbeat = resolveProfileHeartbeat(profile);
  if (heartbeat) {
    return formatLastSeen(heartbeat, isOnline);
  }

  if (isOwner) {
    return formatLastSeen(undefined, false);
  }

  return "";
}
