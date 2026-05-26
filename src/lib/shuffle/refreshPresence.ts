import { isRecentlyActive } from "@/lib/presence";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export function refreshProfilePresence(profile: ShuffleProfile): ShuffleProfile {
  const heartbeat = profile.presenceAt || profile.lastActive;

  return {
    ...profile,
    showOnline: isRecentlyActive(heartbeat, profile.online),
  };
}

export function refreshPoolPresence(pool: ShuffleProfile[]) {
  return pool.map(refreshProfilePresence);
}
