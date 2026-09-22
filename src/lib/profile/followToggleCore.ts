/** Pure follow-count math. The API applies it inside one transaction. */

export function nextSocialCount(current: unknown, delta: number): number {
  const base = Number(current);
  const safe = Number.isFinite(base) ? base : 0;
  return Math.max(0, safe + delta);
}
