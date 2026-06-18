import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";
import { dedupeShuffleProfiles } from "@/lib/shuffle/dedupeProfiles";
import type { ShuffleProfile } from "@/lib/shuffle/types";

const SHUFFLE_POOL_KEY = "sayittome:shuffle:pool:v8";
const SHUFFLE_STATS_KEY = "sayittome:shuffle:stats:v1";
const POOL_TTL_MS = 8 * 60_000;
const STATS_TTL_MS = 5 * 60_000;

export type ShuffleStatsCache = {
  profilesCreated: number;
  anonymousOnline: number;
  totalLive: number;
};

export function readCachedShufflePool() {
  const cached = readClientCache<ShuffleProfile[]>(SHUFFLE_POOL_KEY, POOL_TTL_MS);
  return cached ? dedupeShuffleProfiles(cached) : cached;
}

export function writeCachedShufflePool(profiles: ShuffleProfile[]) {
  writeClientCache(SHUFFLE_POOL_KEY, dedupeShuffleProfiles(profiles));
}

export function readCachedShuffleStats() {
  return readClientCache<ShuffleStatsCache>(SHUFFLE_STATS_KEY, STATS_TTL_MS);
}

export function writeCachedShuffleStats(stats: ShuffleStatsCache) {
  writeClientCache(SHUFFLE_STATS_KEY, stats);
}
