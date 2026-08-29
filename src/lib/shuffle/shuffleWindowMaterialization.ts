/**
 * When the pool has candidates but nothing is painted, always deal a window.
 * Warm-nav suppression and keep-alive freeze must not leave an empty feed.
 */
export function shouldDealShuffleWindowDespiteSuppression(input: {
  poolLength: number;
  featuredLength: number;
  visibleLength: number;
}): boolean {
  const poolReady = Math.max(0, input.poolLength) > 0 || Math.max(0, input.featuredLength) > 0;
  return poolReady && Math.max(0, input.visibleLength) === 0;
}

export function resolveShufflePoolLength(primary: number, fallback: number) {
  return Math.max(0, primary) > 0 ? Math.max(0, primary) : Math.max(0, fallback);
}
