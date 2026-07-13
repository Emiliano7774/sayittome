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
/** Fresh/anon micro-slide: intent held while pool warms even before durable slots exist. */
let warmHopColdWarmup = false;

/** INVARIANT 0 — register before router commits when hop target is restorable. */
export function beginShuffleDestinationWarmIntent(
  navSeq: number,
  restorableSlots?: number,
  options?: { allowColdWarmup?: boolean },
) {
  const durable = restorableSlots ?? countDurableRestorableWarmSlots();
  const allowCold = options?.allowColdWarmup === true;
  if (durable < 3 && !hasShuffleEverHydrated() && !allowCold) {
    abortShuffleDestinationWarmIntent();
    return false;
  }

  warmHopNavSeq = navSeq;
  warmHopRestorableSlots = Math.max(durable, hasShuffleEverHydrated() ? 3 : 0);
  warmHopColdWarmup = allowCold && durable < 3 && !hasShuffleEverHydrated();
  warmHopActive = true;
  return true;
}

export function settleShuffleDestinationWarmIntent() {
  warmHopActive = false;
  warmHopNavSeq = null;
  warmHopRestorableSlots = 0;
  warmHopColdWarmup = false;
}

export function abortShuffleDestinationWarmIntent() {
  warmHopActive = false;
  warmHopNavSeq = null;
  warmHopRestorableSlots = 0;
  warmHopColdWarmup = false;
}

/**
 * True for the current Chats→Shuffle hop once restorable warm was proven at pointerdown,
 * or while a micro-slide cold-warmup intent is held (no-loading mid-slide contract).
 */
export function isShuffleDestinationWarmIntentActive() {
  return warmHopActive && (warmHopRestorableSlots >= 3 || warmHopColdWarmup);
}

export function getShuffleDestinationWarmIntent() {
  return {
    active: warmHopActive,
    navSeq: warmHopNavSeq,
    restorableSlots: warmHopRestorableSlots,
    coldWarmup: warmHopColdWarmup,
  };
}
