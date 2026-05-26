export const SHUFFLE_WINDOW_SIZE = 35;

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
