import { isShuffleProfileOnline, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS } from "@/lib/presence";
import { forceShuffleVisitorOnline } from "@/lib/shuffle/shuffleVisitorId";
import type { ShuffleProfile } from "@/lib/shuffle/types";

/** Privacy setting hides the last-seen timestamp, never the online badge. */
export function refreshProfilePresence(profile: ShuffleProfile, now = Date.now()): ShuffleProfile {
  if (profile.shuffleVisitor) return forceShuffleVisitorOnline(profile);
  return {...profile, showOnline: isShuffleProfileOnline(profile, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS)};
}

export function refreshPoolPresence(pool: ShuffleProfile[], now = Date.now()) {
  return pool.map(profile => refreshProfilePresence(profile, now));
}
