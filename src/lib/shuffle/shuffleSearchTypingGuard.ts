/**
 * Active Shuffle search typing / focus guard.
 *
 * Blocks pool=full&force and countOnly while the search field is focused or
 * recently typed — including the hydration race where the user focuses the
 * input before React attaches onFocus (DOM capture arms the guard first).
 *
 * Deferred network is never flushed while focused; on blur deferred force /
 * countOnly are dropped (TTL / next idle poll can refresh later). No new APIs.
 */

const SEARCH_TYPING_IDLE_MS = 2500;
const SEARCH_INPUT_SELECTOR =
  'input[placeholder*="Buscar"], input[name="search"], input[type="search"], input[aria-label*="Buscar"], input[data-shuffle-search="1"]';

let typingActive = false;
let searchFocused = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let deferredPoolLoad: { q: string; force: boolean } | null = null;
let deferredCountOnly = false;
let domBridgeInstalled = false;

type PoolLoadFn = (opts: { q?: string; force?: boolean }) => void | Promise<void>;
type CountOnlyFn = () => void | Promise<void>;

let flushPoolLoad: PoolLoadFn | null = null;
let flushCountOnly: CountOnlyFn | null = null;

function isShuffleSearchInput(target: EventTarget | null): boolean {
  if (typeof HTMLInputElement === "undefined") return false;
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.matches?.(SEARCH_INPUT_SELECTOR)) return true;
  const ph = (target.getAttribute("placeholder") || "").toLowerCase();
  const aria = (target.getAttribute("aria-label") || "").toLowerCase();
  const name = (target.getAttribute("name") || "").toLowerCase();
  return (
    name === "search" ||
    target.type === "search" ||
    ph.includes("buscar") ||
    aria.includes("buscar") ||
    target.dataset?.shuffleSearch === "1"
  );
}

function clearIdleTimer() {
  if (idleTimer != null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function dropDeferredNetwork() {
  deferredPoolLoad = null;
  deferredCountOnly = false;
}

function networkSuppressed() {
  return searchFocused || typingActive;
}

function armTypingIdle() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    typingActive = false;
    idleTimer = null;
    // Never flush while the search field still owns focus — that is what
    // landed pool=full&force + countOnly inside F6 typing windows after 1s idle.
    if (searchFocused) return;
    dropDeferredNetwork();
  }, SEARCH_TYPING_IDLE_MS);
}

/** Mark search focus / keypress / composition — blocks new pool force + countOnly. */
export function markShuffleSearchTypingActive() {
  if (typeof window === "undefined") return;
  typingActive = true;
  armTypingIdle();
}

export function markShuffleSearchFocused() {
  if (typeof window === "undefined") return;
  searchFocused = true;
  typingActive = true;
  armTypingIdle();
}

export function markShuffleSearchBlurred() {
  if (typeof window === "undefined") return;
  searchFocused = false;
  clearIdleTimer();
  typingActive = false;
  // Drop deferred refresh — do not fire force/countOnly on blur into a
  // still-open harness measurement window.
  dropDeferredNetwork();
}

export function isShuffleSearchTypingActive() {
  return networkSuppressed();
}

/**
 * Install capture-phase DOM bridge so focus/typing before React hydration
 * still arms the guard. Idempotent.
 */
export function ensureShuffleSearchTypingGuardInstalled() {
  if (typeof window === "undefined" || domBridgeInstalled) return;
  domBridgeInstalled = true;

  window.addEventListener(
    "focusin",
    (event) => {
      if (isShuffleSearchInput(event.target)) {
        markShuffleSearchFocused();
      }
    },
    true,
  );

  window.addEventListener(
    "focusout",
    (event) => {
      if (!isShuffleSearchInput(event.target)) return;
      // Defer blur until after focus moves — ignore focus moving within search.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (isShuffleSearchInput(active)) return;
        markShuffleSearchBlurred();
      }, 0);
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (isShuffleSearchInput(event.target)) {
        markShuffleSearchTypingActive();
      }
    },
    true,
  );

  window.addEventListener(
    "input",
    (event) => {
      if (isShuffleSearchInput(event.target)) {
        markShuffleSearchTypingActive();
      }
    },
    true,
  );

  window.addEventListener(
    "compositionstart",
    (event) => {
      if (isShuffleSearchInput(event.target)) {
        markShuffleSearchTypingActive();
      }
    },
    true,
  );
}

export function registerShuffleSearchTypingFlushers(opts: {
  loadProfiles: PoolLoadFn;
  pollCountOnly: CountOnlyFn;
}) {
  ensureShuffleSearchTypingGuardInstalled();
  flushPoolLoad = opts.loadProfiles;
  flushCountOnly = opts.pollCountOnly;
}

export function unregisterShuffleSearchTypingFlushers() {
  flushPoolLoad = null;
  flushCountOnly = null;
}

/**
 * If typing/focus is active, remember the pool load for later and skip now.
 * Returns true when the caller must not fetch.
 */
export function deferShufflePoolLoadIfTyping(opts: { q?: string; force?: boolean }) {
  ensureShuffleSearchTypingGuardInstalled();
  if (!networkSuppressed()) return false;
  deferredPoolLoad = {
    q: opts.q ?? "",
    force: opts.force === true,
  };
  return true;
}

/**
 * If typing/focus is active, remember countOnly for later and skip now.
 * Returns true when the caller must not fetch.
 */
export function deferShuffleCountOnlyIfTyping() {
  ensureShuffleSearchTypingGuardInstalled();
  if (!networkSuppressed()) return false;
  deferredCountOnly = true;
  return true;
}

export function getShuffleSearchTypingDebug() {
  return {
    typingActive,
    searchFocused,
    deferredPoolLoad,
    deferredCountOnly,
    idleMs: SEARCH_TYPING_IDLE_MS,
    domBridgeInstalled,
    // flushers retained for diagnostics only — not invoked while focused
    hasFlushers: Boolean(flushPoolLoad || flushCountOnly),
  };
}
