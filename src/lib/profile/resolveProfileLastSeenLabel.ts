import { SHUFFLE_REGISTERED_ONLINE_WINDOW_MS } from "@/lib/presence";
import {
  canShowLastSeenToViewer,
  isLastSeenPublic,
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
  formatLastSeen: (lastActive?: string | null, online?: boolean, windowMs?: number, labelMs?: number) => string,
  isOnline: boolean,
) {
  if (!profile || !isLastSeenPublic(profile) || !canShowLastSeenToViewer(profile, isOwner)) {
    return "";
  }

  const heartbeat = resolveProfileHeartbeat(profile);
  if (heartbeat) {
    return formatLastSeen(
      heartbeat,
      isOnline,
      SHUFFLE_REGISTERED_ONLINE_WINDOW_MS,
      SHUFFLE_REGISTERED_ONLINE_WINDOW_MS,
    );
  }

  if (isOwner) {
    return formatLastSeen(undefined, false);
  }

  return "";
}
