import { markShuffleHydrated, hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { SHUFFLE_WINDOW_SIZE } from "@/lib/shuffle/pickWindow";
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

export function capturePinnedShuffleWindow(
  featured: ShuffleProfile[],
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
) {
  if (count <= 0 && getVisibleShuffleProfiles().length === 0) return;

  pinned = {
    featured: featured.map((row) => ({ ...row })),
    pool: pool.map((row) => ({ ...row })),
    indices: new Int32Array(indices),
    count: Math.max(0, Math.min(count, SHUFFLE_WINDOW_SIZE)),
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
  return pinned?.count ?? 0;
}
