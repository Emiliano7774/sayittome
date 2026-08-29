import {
  profileMatchesShuffleExcludeKeys,
  shuffleProfileDedupeKeys,
} from "@/lib/shuffle/dedupeProfiles";

export const SHUFFLE_WINDOW_SIZE = 35;

/**
 * Prior shuffle windows to exclude so the next tap prefers unseen people.
 * Leaves at least one full window of unused profiles: floor((pool - window) / window).
 * ~340 → 8, ~505 → 13, and it grows as more people register.
 */
export function shuffleBatchMemoryForPool(
  poolSize: number,
  windowSize = SHUFFLE_WINDOW_SIZE,
): number {
  const n = Math.max(0, Math.floor(Number(poolSize) || 0));
  const w = Math.max(1, Math.floor(Number(windowSize) || SHUFFLE_WINDOW_SIZE));
  return Math.max(0, Math.floor((n - w) / w));
}

/** Legacy cap for ~340 profiles. Prefer shuffleBatchMemoryForPool(poolSize). */
export const SHUFFLE_BATCH_MEMORY = shuffleBatchMemoryForPool(340);

/** Partial shuffle: O(k) con k=35, sin barajar el pool completo. */
export function pickRandomWindowIndices(
  poolLength: number,
  scratch: number[],
  out: Int32Array,
  size = SHUFFLE_WINDOW_SIZE,
): number {
  if (poolLength <= 0) return 0;

  const n = Math.min(size, poolLength);

  if (poolLength > scratch.length) {
    scratch.length = poolLength;
  }

  for (let i = 0; i < poolLength; i++) {
    scratch[i] = i;
  }

  for (let i = 0; i < n; i++) {
    const j = i + ((Math.random() * (poolLength - i)) | 0);
    const tmp = scratch[i];
    scratch[i] = scratch[j];
    scratch[j] = tmp;
  }

  for (let i = 0; i < n; i++) {
    out[i] = scratch[i];
  }

  return n;
}

function pickUniqueIndicesFromPool(
  pool: Array<{ uid: string; username: string; authUid?: string; photo?: string }>,
  order: number[],
  out: Int32Array,
  size: number,
  excludeKeys?: ReadonlySet<string>,
  outStart = 0,
  seedUsed?: Set<string>,
  options?: { strictExclude?: boolean },
) {
  const used = seedUsed ? new Set(seedUsed) : new Set<string>();
  let count = 0;

  for (let i = 0; i < order.length && count < size; i++) {
    const idx = order[i];
    const keys = shuffleProfileDedupeKeys(pool[idx]);
    if (keys.length === 0 || keys.some((key) => used.has(key))) continue;
    if (excludeKeys && profileMatchesShuffleExcludeKeys(pool[idx], excludeKeys)) continue;

    for (const key of keys) used.add(key);
    out[outStart + count] = idx;
    count += 1;
  }

  return { count, used };
}

/** Like pickRandomWindowIndices but never returns two indices for the same identity. */
export function pickRandomUniqueWindowIndices(
  pool: Array<{ uid: string; username: string; authUid?: string; photo?: string }>,
  scratch: number[],
  out: Int32Array,
  size = SHUFFLE_WINDOW_SIZE,
  excludeKeys?: ReadonlySet<string>,
  options?: { strictExclude?: boolean },
): number {
  const poolLength = pool.length;
  if (poolLength <= 0) return 0;

  if (poolLength > scratch.length) {
    scratch.length = poolLength;
  }

  for (let i = 0; i < poolLength; i++) {
    scratch[i] = i;
  }

  for (let i = 0; i < poolLength; i++) {
    const j = i + ((Math.random() * (poolLength - i)) | 0);
    const tmp = scratch[i];
    scratch[i] = scratch[j];
    scratch[j] = tmp;
  }

  const target = Math.min(size, poolLength);
  const strictExclude = options?.strictExclude === true;
  const firstPass = pickUniqueIndicesFromPool(
    pool,
    scratch,
    out,
    target,
    excludeKeys,
    0,
    undefined,
    options,
  );
  let count = firstPass.count;

  if (count < target) {
    const secondPass = pickUniqueIndicesFromPool(
      pool,
      scratch,
      out,
      target - count,
      strictExclude ? undefined : excludeKeys,
      count,
      firstPass.used,
      options,
    );
    count += secondPass.count;
  }

  return count;
}
