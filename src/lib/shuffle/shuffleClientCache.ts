import {
  readDurableClientCache,
  writeDurableClientCache,
} from "@/lib/cache/clientCache";
import { applyShuffleAdminTagOverlays } from "@/lib/shuffle/shuffleAdminTagOverlay";
import { SHUFFLE_DEDUPE_VERSION, dedupeShuffleProfiles } from "@/lib/shuffle/dedupeProfiles";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export const SHUFFLE_POOL_KEY = `sayittome:shuffle:pool:v${SHUFFLE_DEDUPE_VERSION}`;
const SHUFFLE_POOL_FETCHED_AT_KEY = `${SHUFFLE_POOL_KEY}:fetched-at`;
const SHUFFLE_STATS_KEY = "sayittome:shuffle:stats:v16";
export const SHUFFLE_POOL_TTL_MS = 30 * 60_000;
export const SHUFFLE_POOL_REFRESH_MS = 8 * 60_000;
export const SHUFFLE_STATS_TTL_MS = 10 * 60_000;

export type ShuffleStatsCache = {
  profilesCreated: number;
  anonymousOnline: number;
  totalLive: number;
};

function durableShuffleProfiles(profiles: ShuffleProfile[]) {
  return profiles.filter((profile) => profile.shuffleVisitor !== true);
}

export function readCachedShufflePool() {
  const cached = readDurableClientCache<ShuffleProfile[]>(
    SHUFFLE_POOL_KEY,
    SHUFFLE_POOL_TTL_MS,
  );
  if (!cached) return cached;
  return applyShuffleAdminTagOverlays(
    dedupeShuffleProfiles(durableShuffleProfiles(cached)),
  );
}

export function writeCachedShufflePool(profiles: ShuffleProfile[]) {
  const durable = durableShuffleProfiles(profiles);
  if (durable.length === 0) return;
  writeDurableClientCache(
    SHUFFLE_POOL_KEY,
    applyShuffleAdminTagOverlays(dedupeShuffleProfiles(durable)),
  );
  writeDurableClientCache(SHUFFLE_POOL_FETCHED_AT_KEY, Date.now());
}

export function isCachedShufflePoolFresh(now = Date.now()) {
  const fetchedAt = readDurableClientCache<number>(
    SHUFFLE_POOL_FETCHED_AT_KEY,
    SHUFFLE_POOL_TTL_MS,
  );
  return Boolean(
    fetchedAt &&
      Number.isFinite(fetchedAt) &&
      now - fetchedAt <= SHUFFLE_POOL_REFRESH_MS,
  );
}

export function readCachedShuffleStats() {
  return readDurableClientCache<ShuffleStatsCache>(
    SHUFFLE_STATS_KEY,
    SHUFFLE_STATS_TTL_MS,
  );
}

export function writeCachedShuffleStats(stats: ShuffleStatsCache) {
  writeDurableClientCache(SHUFFLE_STATS_KEY, stats);
}
