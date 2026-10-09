import type { ShuffleFilters } from "@/lib/shuffle/filters";
import { shuffleFiltersFingerprint } from "@/lib/navigation/shuffleSessionSnapshot";
import { shuffleProfileBatchExcludeKeys } from "@/lib/shuffle/dedupeProfiles";

export type FairShuffleIdentity = {
  uid: string;
  authUid?: string;
  firebaseUid?: string;
  aliasIds?: string[];
  shuffleVisitor?: boolean;
};

const MAX_FILTER_CYCLES = 24;
const seenByFilter = new Map<string, Set<string>>();

/** A separate in-memory cycle for each discovery filter/search combination. */
export function shuffleFairCycleScope(
  filters: ShuffleFilters,
  search = "",
  session = "visitor",
): string {
  const canonicalFilters = {
    ...filters,
    verPaises: [...filters.verPaises].sort(),
    verProvincias: [...filters.verProvincias].sort(),
    aparecerPaises: [...filters.aparecerPaises].sort(),
    aparecerProvincias: [...filters.aparecerProvincias].sort(),
    intereses: [...filters.intereses].sort(),
  };
  return `${session}|${shuffleFiltersFingerprint(canonicalFilters, search.trim().toLowerCase())}`;
}

export function shuffleFairSeen(scope: string): Set<string> {
  const existing = seenByFilter.get(scope);
  if (existing) {
    // Map order implements bounded LRU; preserve the Set across remounts.
    seenByFilter.delete(scope);
    seenByFilter.set(scope, existing);
    return existing;
  }
  const fresh = new Set<string>();
  seenByFilter.set(scope, fresh);
  while (seenByFilter.size > MAX_FILTER_CYCLES) {
    const oldest = seenByFilter.keys().next().value;
    if (oldest === undefined) break;
    seenByFilter.delete(oldest);
  }
  return fresh;
}

export function shuffleFairKeys(profile: FairShuffleIdentity): string[] {
  const keys = shuffleProfileBatchExcludeKeys(profile);
  return keys.length ? keys : profile.uid ? [`id:${profile.uid}`] : [];
}

export function shuffleFairWasSeen(
  profile: FairShuffleIdentity,
  seen: ReadonlySet<string>,
) {
  return shuffleFairKeys(profile).some((key) => seen.has(key));
}

export function markShuffleFairWindow(
  profiles: FairShuffleIdentity[],
  seen: Set<string>,
): void {
  for (const profile of profiles) {
    for (const key of shuffleFairKeys(profile)) seen.add(key);
  }
}

/**
 * The next page only contains unseen eligible identities. When none remain,
 * start a new cycle. Last pages may be shorter than 35; never pad them with
 * previously seen identities. This runs solely on an already fetched pool.
 */
export function nextUnseenShufflePool<T extends FairShuffleIdentity>(
  pool: T[],
  seen: Set<string>,
): { pool: T[]; restarted: boolean } {
  const unseen = pool.filter((profile) => !shuffleFairWasSeen(profile, seen));
  if (unseen.length > 0 || pool.length === 0) {
    return { pool: unseen, restarted: false };
  }
  seen.clear();
  return { pool: pool.slice(), restarted: true };
}

/** Presence polling keeps current cards but never resurrects previous pages. */
export function filterShuffleFairLiveVisitors<T extends FairShuffleIdentity>(
  visitors: T[],
  visible: FairShuffleIdentity[],
  seen: ReadonlySet<string>,
): T[] {
  const visibleIds = new Set(visible.flatMap(shuffleFairKeys));
  return visitors.filter((row) => {
    const keys = shuffleFairKeys(row);
    if (!keys.length) return false;
    return !shuffleFairWasSeen(row, seen) ||
      keys.some((key) => visibleIds.has(key));
  });
}

/** Explicit logout/tests only. Regular filter changes keep independent cycles. */
export function clearShuffleFairCycles() {
  seenByFilter.clear();
}
