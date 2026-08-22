import { markShuffleHydrated, hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import {
  clearShuffleViewportSnapshot,
  hasUsableShuffleViewportSnapshot,
  matchShuffleProfileByCardId,
  peekShuffleViewportSnapshot,
} from "@/lib/navigation/shuffleViewportSnapshot";
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

export function clearPinnedShuffleWindow() {
  pinned = null;
}

function restoreWindowFromSnapshotCache() {
  const snapshot = peekShuffleViewportSnapshot();
  if (!snapshot || !hasUsableShuffleViewportSnapshot() || snapshot.cardIds.length === 0) {
    return false;
  }
  const cached = readCachedShufflePool();
  if (!cached || cached.length === 0) {
    clearShuffleViewportSnapshot();
    return restoreFromCachedPoolSync();
  }

  const ordered: ShuffleProfile[] = [];
  const used = new Set<string>();
  for (const cardId of snapshot.cardIds) {
    const found = cached.find((profile) => matchShuffleProfileByCardId(profile, cardId));
    if (!found) continue;
    const key = shuffleProfileKey(found);
    if (used.has(key)) continue;
    used.add(key);
    ordered.push(found);
  }

  if (ordered.length === 0) {
    clearShuffleViewportSnapshot();
    return restoreFromCachedPoolSync();
  }

  const indices = new Int32Array(SHUFFLE_WINDOW_SIZE);
  const count = Math.min(ordered.length, SHUFFLE_WINDOW_SIZE);
  for (let slot = 0; slot < count; slot += 1) indices[slot] = slot;
  setShuffleSlotsWithFeatured([], ordered, indices, count, false);
  flushShuffleSlotsSync();
  capturePinnedShuffleWindow([], ordered, indices, count);

  const restored = getVisibleShuffleProfiles();
  if (restored.length > 0) {
    markShuffleHydrated(restored.length);
    return true;
  }
  clearShuffleViewportSnapshot();
  return restoreFromCachedPoolSync();
}

function shuffleProfileKey(profile: ShuffleProfile) {
  return `${profile.uid || ""}:${profile.username || ""}`;
}

export function applyPinnedShuffleWindowSync(options?: { force?: boolean }) {
  if (!pinned) return false;
  if (!options?.force) {
    const visibleNow = getVisibleShuffleProfiles();
    if (visibleNow.length > 0) {
      markShuffleHydrated(visibleNow.length);
      return true;
    }
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
  return false;
}

/** PREPARE — restore last valid shuffle window synchronously (no React commit). */
export function restorePinnedShuffleWindowSync() {
  if (hasUsableShuffleViewportSnapshot() && pinned) {
    return applyPinnedShuffleWindowSync({ force: true });
  }

  const visibleNow = getVisibleShuffleProfiles();
  if (visibleNow.length > 0) {
    markShuffleHydrated(visibleNow.length);
    return true;
  }

  if (pinned) {
    return applyPinnedShuffleWindowSync() || hasShuffleEverHydrated();
  }

  if (hasUsableShuffleViewportSnapshot()) {
    if (restoreWindowFromSnapshotCache()) return true;
  }

  if (restoreFromCachedPoolSync()) return true;
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
