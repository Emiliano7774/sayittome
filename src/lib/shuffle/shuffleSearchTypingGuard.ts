/**
 * Active Shuffle search typing guard.
 * Defers mount/TTL pool force and countOnly while the user focuses/types in search,
 * so cold warmup cannot land inside the keypress window.
 * Does not add network; only delays existing mount/interval work until idle.
 */

const SEARCH_TYPING_IDLE_MS = 1000;

let typingActive = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let deferredPoolLoad: { q: string; force: boolean } | null = null;
let deferredCountOnly = false;

type PoolLoadFn = (opts: { q?: string; force?: boolean }) => void | Promise<void>;
type CountOnlyFn = () => void | Promise<void>;

let flushPoolLoad: PoolLoadFn | null = null;
let flushCountOnly: CountOnlyFn | null = null;

export function registerShuffleSearchTypingFlushers(opts: {
  loadProfiles: PoolLoadFn;
  pollCountOnly: CountOnlyFn;
}) {
  flushPoolLoad = opts.loadProfiles;
  flushCountOnly = opts.pollCountOnly;
}

export function unregisterShuffleSearchTypingFlushers() {
  flushPoolLoad = null;
  flushCountOnly = null;
}

function clearIdleTimer() {
  if (idleTimer != null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function flushDeferredNetwork() {
  const pool = deferredPoolLoad;
  deferredPoolLoad = null;
  const count = deferredCountOnly;
  deferredCountOnly = false;
  if (pool && flushPoolLoad) {
    void flushPoolLoad(pool);
  }
  if (count && flushCountOnly) {
    void flushCountOnly();
  }
}

/** Mark search focus / keypress / composition — blocks new pool force + countOnly. */
export function markShuffleSearchTypingActive() {
  if (typeof window === "undefined") return;
  typingActive = true;
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    typingActive = false;
    idleTimer = null;
    flushDeferredNetwork();
  }, SEARCH_TYPING_IDLE_MS);
}

export function isShuffleSearchTypingActive() {
  return typingActive;
}

/**
 * If typing is active, remember the pool load for idle flush and skip now.
 * Returns true when the caller must not fetch.
 */
export function deferShufflePoolLoadIfTyping(opts: { q?: string; force?: boolean }) {
  if (!typingActive) return false;
  deferredPoolLoad = {
    q: opts.q ?? "",
    force: opts.force === true,
  };
  return true;
}

/**
 * If typing is active, remember countOnly for idle flush and skip now.
 * Returns true when the caller must not fetch.
 */
export function deferShuffleCountOnlyIfTyping() {
  if (!typingActive) return false;
  deferredCountOnly = true;
  return true;
}

export function getShuffleSearchTypingDebug() {
  return {
    typingActive,
    deferredPoolLoad,
    deferredCountOnly,
    idleMs: SEARCH_TYPING_IDLE_MS,
  };
}
