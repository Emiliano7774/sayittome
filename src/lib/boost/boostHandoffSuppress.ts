/**
 * Internal Boost handoff suppress window (settle + short post-guard grace).
 * Direct cold /boost never arms this — only handoff begin/scheduleClear paths.
 */
let boostSequenceHandoffSuppressUntil = 0;

/** Arm / extend internal Boost handoff suppress (settle + post-guard grace). */
export function armBoostSequenceHandoffSuppress(ms = 480) {
  const until = Date.now() + Math.max(0, ms);
  if (until > boostSequenceHandoffSuppressUntil) {
    boostSequenceHandoffSuppressUntil = until;
  }
}

export function isBoostSequenceHandoffSuppressActive() {
  return Date.now() < boostSequenceHandoffSuppressUntil;
}
