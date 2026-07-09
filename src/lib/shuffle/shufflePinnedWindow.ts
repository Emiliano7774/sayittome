import { markShuffleHydrated, hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { readCachedShufflePool } from "@/lib/shuffle/shuffleClientCache";
import {
  pickRandomUniqueWindowIndices,
  SHUFFLE_WINDOW_SIZE,
} from "@/lib/shuffle/pickWindow";
import {
  getVisibleShuffleProfiles,
  setShuffleSlotsWithFeatured,
  flushShuffleSlotsSync,
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type PinnedWindow = {
  featured: ShuffleProfile[];
  pool: ShuffleProfile[];
  indices: Int32Array;
  count: number;
};

let pinned: PinnedWindow | null = null;
const cacheRestoreScratch: number[] = [];
const cacheRestoreIndices = new Int32Array(SHUFFLE_WINDOW_SIZE);

function restoreFromCachedPoolSync() {
  const cached = readCachedShufflePool();
  if (!cached || cached.length < 3) return false;

  // Cold restore must deal a fresh random window — never the cached pool prefix.
  const count = pickRandomUniqueWindowIndices(
    cached,
    cacheRestoreScratch,
    cacheRestoreIndices,
    SHUFFLE_WINDOW_SIZE,
  );
  if (count < 3) return false;

  setShuffleSlotsWithFeatured([], cached, cacheRestoreIndices, count, false);
  flushShuffleSlotsSync();

  const restored = getVisibleShuffleProfiles();
  if (restored.length > 0) {
    markShuffleHydrated(restored.length);
    return true;
  }

  return false;
}

export function capturePinnedShuffleWindow(
  featured: ShuffleProfile[],
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
) {
  const visibleCount = getVisibleShuffleProfiles().length;
  const effectiveCount = Math.max(count, visibleCount);
  if (effectiveCount <= 0 && visibleCount === 0) return;

  pinned = {
    featured: featured.map((row) => ({ ...row })),
    pool: pool.map((row) => ({ ...row })),
    indices: new Int32Array(indices),
    count: Math.max(0, Math.min(effectiveCount, SHUFFLE_WINDOW_SIZE)),
  };
}

/** PREPARE — restore last valid shuffle window synchronously (no React commit). */
export function restorePinnedShuffleWindowSync() {
  const visibleNow = getVisibleShuffleProfiles();
  if (visibleNow.length > 0) {
    markShuffleHydrated(visibleNow.length);
    return true;
  }

  if (!pinned) {
    if (restoreFromCachedPoolSync()) return true;
    return hasShuffleEverHydrated();
  }

  setShuffleSlotsWithFeatured(
    pinned.featured,
    pinned.pool,
    pinned.indices,
    pinned.count,
    false,
  );
  flushShuffleSlotsSync();

  const restored = getVisibleShuffleProfiles();
  if (restored.length > 0) {
    markShuffleHydrated(restored.length);
    return true;
  }

  return hasShuffleEverHydrated();
}

export function hasShuffleWarmVisualReady() {
  return getVisibleShuffleProfiles().length > 0 || hasShuffleEverHydrated();
}

export function peekPinnedShuffleWindowCount() {
  if (pinned?.count) return pinned.count;
  const cached = readCachedShufflePool();
  return cached ? Math.min(SHUFFLE_WINDOW_SIZE, cached.length) : 0;
}
