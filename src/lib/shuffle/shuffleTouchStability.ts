/**
 * Keep Shuffle's current card DOM mounted for the entire touch gesture.
 *
 * Chromium dispatches touchmove to the *original* touch target. If an online
 * presence/pool refresh replaces that card, the browser stops delivering move
 * events to the scroller, so the list visually detaches from the finger.
 *
 * Hold only Shuffle's visual feed until touchend/cancel. Data, presence and
 * notifications continue updating normally; the feed catches up on release.
 */
let active = false;
let epoch = 0;
let lastInputAt = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>();

export function isShuffleTouchGestureActive() {
  return active;
}

export function getShuffleTouchReleaseEpoch() {
  return epoch;
}

export function getServerShuffleTouchReleaseEpoch() {
  return 0;
}

export function subscribeShuffleTouchRelease(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function finish() {
  if (!active) return;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  active = false;
  if (safetyTimer !== null) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  epoch++;
  for (const notify of subscribers) notify();
}

function checkForLostTouch() {
  safetyTimer = null;
  if (!active) return;
  const idleFor = Date.now() - lastInputAt;
  if (idleFor >= 12000) {
    finish();
    return;
  }
  safetyTimer = setTimeout(checkForLostTouch, Math.max(100, 12000 - idleFor));
}

export function startShuffleTouchGesture() {
  // A second tap may begin during the short click-synthesis grace period.
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (!active) {
    active = true;
    safetyTimer = setTimeout(checkForLostTouch, 12000);
  }
  lastInputAt = Date.now();
}

export function continueShuffleTouchGesture() {
  if (active) lastInputAt = Date.now();
}

export function endShuffleTouchGesture() {
  if (!active) return;
  // Keep the touch target through Chromium's synthesized click after touchend.
  // A synchronous React refresh here can unmount the card before its click fires.
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(finish, 90);
}
