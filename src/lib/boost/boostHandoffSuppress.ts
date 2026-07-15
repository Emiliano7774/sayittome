/**
 * Internal Boost handoff suppress window (settle + short post-guard grace).
 * Direct cold /boost never arms this — only handoff begin/scheduleClear paths.
 * Suppress is tx-scoped so a stale Boost arm cannot outlive its handoff token.
 */
let boostSequenceHandoffSuppressUntil = 0;
let boostSequenceHandoffSuppressTxId: string | null = null;

/** Arm / extend internal Boost handoff suppress (settle + post-guard grace). */
export function armBoostSequenceHandoffSuppress(
  ms = 480,
  opts?: { txId?: string | null },
) {
  const until = Date.now() + Math.max(0, ms);
  const txId = opts?.txId ?? null;
  // Newer or same tx may extend; different older tx without id may still extend
  // for backward-compat paths that omit txId during the same Boost handoff.
  if (txId) {
    boostSequenceHandoffSuppressTxId = txId;
  }
  if (until > boostSequenceHandoffSuppressUntil) {
    boostSequenceHandoffSuppressUntil = until;
  }
}

export function isBoostSequenceHandoffSuppressActive(opts?: {
  txId?: string | null;
}) {
  if (Date.now() >= boostSequenceHandoffSuppressUntil) return false;
  if (
    opts?.txId &&
    boostSequenceHandoffSuppressTxId &&
    opts.txId !== boostSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  return true;
}

export function clearBoostSequenceHandoffSuppress(opts?: {
  txId?: string | null;
  force?: boolean;
}) {
  if (
    !opts?.force &&
    opts?.txId &&
    boostSequenceHandoffSuppressTxId &&
    opts.txId !== boostSequenceHandoffSuppressTxId
  ) {
    return false;
  }
  boostSequenceHandoffSuppressUntil = 0;
  boostSequenceHandoffSuppressTxId = null;
  return true;
}

export function getBoostSequenceHandoffSuppressTxId() {
  return boostSequenceHandoffSuppressTxId;
}
