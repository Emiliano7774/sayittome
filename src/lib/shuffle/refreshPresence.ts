import { isActiveWithinWindow } from "@/lib/presence";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export function refreshProfilePresence(profile: ShuffleProfile): ShuffleProfile {
  return {
    ...profile,
    showOnline: isActiveWithinWindow(profile.presenceAt, profile.lastActive),
  };
}

export function refreshPoolPresence(pool: ShuffleProfile[]) {
  return pool.map(refreshProfilePresence);
}
