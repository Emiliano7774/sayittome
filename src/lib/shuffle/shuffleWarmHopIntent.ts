import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import { readCachedShufflePool } from "@/lib/shuffle/shuffleClientCache";
import { peekPinnedShuffleWindowCount } from "@/lib/shuffle/shufflePinnedWindow";

/**
 * Durable warm snapshot — pinned window and client cache only.
 * Does not depend on visible store count, React hydration, or keep-alive flags.
 */
export function countDurableRestorableWarmSlots(): number {
  const pinned = peekPinnedShuffleWindowCount();
  if (pinned >= 3) return pinned;

  const cached = readCachedShufflePool();
  if (cached && cached.length >= 3) return cached.length;

  return Math.max(pinned, cached?.length ?? 0);
}

export function hasDurableRestorableWarmShuffle(): boolean {
  return countDurableRestorableWarmSlots() >= 3;
}

let warmHopNavSeq: number | null = null;
let warmHopRestorableSlots = 0;
let warmHopActive = false;

/** INVARIANT 0 — register before router commits when hop target is restorable. */
export function beginShuffleDestinationWarmIntent(navSeq: number, restorableSlots?: number) {
  const durable = restorableSlots ?? countDurableRestorableWarmSlots();
  if (durable < 3 && !hasShuffleEverHydrated()) {
    abortShuffleDestinationWarmIntent();
    return false;
  }

  warmHopNavSeq = navSeq;
  warmHopRestorableSlots = Math.max(durable, hasShuffleEverHydrated() ? 3 : 0);
  warmHopActive = true;
  return true;
}

export function settleShuffleDestinationWarmIntent() {
  warmHopActive = false;
  warmHopNavSeq = null;
  warmHopRestorableSlots = 0;
}

export function abortShuffleDestinationWarmIntent() {
  warmHopActive = false;
  warmHopNavSeq = null;
  warmHopRestorableSlots = 0;
}

/** True for the current Chats→Shuffle hop once restorable warm was proven at pointerdown. */
export function isShuffleDestinationWarmIntentActive() {
  return warmHopActive && warmHopRestorableSlots >= 3;
}

export function getShuffleDestinationWarmIntent() {
  return {
    active: warmHopActive,
    navSeq: warmHopNavSeq,
    restorableSlots: warmHopRestorableSlots,
  };
}
