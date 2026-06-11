import {
  isLastSeenPublic,
  stripPublicPresence,
} from "@/lib/profile/lastSeenVisibility";
import { isShuffleProfileOnline } from "@/lib/presence";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export function refreshProfilePresence(
  profile: ShuffleProfile,
  now = Date.now(),
): ShuffleProfile {
  if (!isLastSeenPublic(profile)) {
    return stripPublicPresence({ ...profile, showOnline: false }, false);
  }
  return {
    ...profile,
    showOnline: isShuffleProfileOnline(profile, now),
  };
}

export function refreshPoolPresence(pool: ShuffleProfile[], now = Date.now()) {
  return pool.map((profile) => refreshProfilePresence(profile, now));
}
