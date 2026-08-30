import {
  dedupeShuffleProfiles,
  shuffleProfileIdentityKey,
} from "@/lib/shuffle/dedupeProfiles";
import {
  profileMatchesShuffleFilters,
  profileMatchesShuffleSearch,
  type ShuffleFilters,
} from "@/lib/shuffle/filters";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export const SHUFFLE_CLICK_RESUFFLE_ATTEMPTS = [
  { forceReplace: true as const, excludeRecentBatches: true as const },
  { forceReplace: true as const, excludeRecentBatches: false as const },
  { forceReplace: true as const, resetBatchMemory: true as const },
];

export type ShuffleClickReshuffleAttempt = (typeof SHUFFLE_CLICK_RESUFFLE_ATTEMPTS)[number];

export type ShuffleReshufflePoolInput = {
  activePool: ShuffleProfile[];
  fullPool: ShuffleProfile[];
  cachedPool: ShuffleProfile[];
  visible: ShuffleProfile[];
  search: string;
  filters: ShuffleFilters;
  storyOwnerUids?: Set<string>;
  now?: number;
};

export type ShuffleReshufflePoolResult = {
  pool: ShuffleProfile[];
  /** When fullPool is empty but cache has rows, hydrate poolRef before dealing. */
  hydrateFullPool: ShuffleProfile[] | null;
  /** True when fullPool/cache are unavailable and a network refresh is required. */
  needsFetch: boolean;
  /** Deal pool came only from visible slots — reshuffle order now, fetch full pool after. */
  visibleFallbackOnly: boolean;
};

function lacksFullShufflePool(fullPool: ShuffleProfile[], cachedPool: ShuffleProfile[]) {
  return fullPool.length === 0 && cachedPool.length === 0;
}

function filterEligiblePool(
  source: ShuffleProfile[],
  search: string,
  filters: ShuffleFilters,
  storyOwnerUids: Set<string>,
  now: number,
) {
  const q = search.trim();
  return dedupeShuffleProfiles(
    source.filter((profile) => {
      if (!profileMatchesShuffleSearch(profile, q)) return false;
      return profileMatchesShuffleFilters(profile, filters, { storyOwnerUids, now });
    }),
  );
}

/** Sorted identity set — detects any window membership change. */
export function shuffleWindowSetSignature(profiles: ShuffleProfile[]) {
  return profiles
    .map((profile) => shuffleProfileIdentityKey(profile) || profile.uid || profile.username)
    .sort()
    .join("|");
}

/** Order-preserving lead rows — matches what the user sees at the top of the feed. */
export function shuffleVisibleLeadSignature(profiles: ShuffleProfile[], leadCount = 10) {
  return profiles
    .slice(0, leadCount)
    .map((profile) => shuffleProfileIdentityKey(profile) || profile.uid || profile.username)
    .join("|");
}

/**
 * Reconstruct the deal pool for Cambiar perfiles when activePool is stale/empty
 * after Chats→Shuffle keep-alive restore or filters-empty recovery.
 */
export function resolveShuffleReshufflePool(
  input: ShuffleReshufflePoolInput,
): ShuffleReshufflePoolResult {
  const now = input.now ?? Date.now();
  const storyOwnerUids = input.storyOwnerUids ?? new Set<string>();
  const cached = dedupeShuffleProfiles(input.cachedPool);
  let hydrateFullPool: ShuffleProfile[] | null = null;

  const fromActive = filterEligiblePool(
    input.activePool,
    input.search,
    input.filters,
    storyOwnerUids,
    now,
  );
  if (fromActive.length > 0) {
    return {
      pool: fromActive,
      hydrateFullPool: null,
      needsFetch: false,
      visibleFallbackOnly: false,
    };
  }

  const fromFull = filterEligiblePool(
    input.fullPool,
    input.search,
    input.filters,
    storyOwnerUids,
    now,
  );
  if (fromFull.length > 0) {
    return {
      pool: fromFull,
      hydrateFullPool: null,
      needsFetch: false,
      visibleFallbackOnly: false,
    };
  }

  if (cached.length > 0 && input.fullPool.length === 0) {
    hydrateFullPool = cached;
  }

  const fromCached = filterEligiblePool(
    cached,
    input.search,
    input.filters,
    storyOwnerUids,
    now,
  );
  if (fromCached.length > 0) {
    return {
      pool: fromCached,
      hydrateFullPool,
      needsFetch: false,
      visibleFallbackOnly: false,
    };
  }

  const needsFetch = lacksFullShufflePool(input.fullPool, cached);

  const fromVisible = filterEligiblePool(
    input.visible,
    input.search,
    input.filters,
    storyOwnerUids,
    now,
  );
  if (fromVisible.length > 0) {
    return {
      pool: fromVisible,
      hydrateFullPool: null,
      needsFetch,
      visibleFallbackOnly: needsFetch,
    };
  }

  return { pool: [], hydrateFullPool, needsFetch, visibleFallbackOnly: false };
}

export function canShuffleReshuffleDeal(poolLength: number, featuredCount: number) {
  return poolLength > 0 || featuredCount > 0;
}

/** Immediate deal then fetch when only partial source exists (visible fallback or featured-only). */
export function shouldRunTwoPhaseShuffleReshuffle(
  resolved: ShuffleReshufflePoolResult,
  featuredCount: number,
) {
  return (
    resolved.visibleFallbackOnly ||
    (resolved.needsFetch && resolved.pool.length === 0 && featuredCount > 0)
  );
}

export function shuffleReshuffleWindowChanged(
  before: ShuffleProfile[],
  after: ShuffleProfile[],
  leadCount = 10,
) {
  if (after.length === 0) return false;
  if (shuffleWindowSetSignature(before) !== shuffleWindowSetSignature(after)) return true;
  return shuffleVisibleLeadSignature(before, leadCount) !== shuffleVisibleLeadSignature(after, leadCount);
}

export function runShuffleClickReshuffleAttempts<T extends ShuffleClickReshuffleAttempt>(args: {
  getVisible: () => ShuffleProfile[];
  attempts: readonly T[];
  applyAttempt: (options: T) => void;
  rememberBatch: (visible: ShuffleProfile[], options: T, isLast: boolean) => void;
  leadCount?: number;
}) {
  const leadCount = args.leadCount ?? 10;
  const before = args.getVisible();

  for (let i = 0; i < args.attempts.length; i += 1) {
    const opts = args.attempts[i];
    const isLast = i === args.attempts.length - 1;

    args.applyAttempt(opts);

    const visible = args.getVisible();
    const changed = shuffleReshuffleWindowChanged(before, visible, leadCount);

    if (changed || isLast) {
      args.rememberBatch(visible, opts, isLast);
      return { changed, attemptsUsed: i + 1 };
    }
  }

  return { changed: false, attemptsUsed: args.attempts.length };
}

/** d527814-style path: deal with empty activePool only — reproduces production no-op. */
export function legacyShuffleClickDealPool(activePool: ShuffleProfile[]) {
  return activePool;
}
