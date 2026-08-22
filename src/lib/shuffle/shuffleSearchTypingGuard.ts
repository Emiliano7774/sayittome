/**
 * Active Shuffle search typing / focus guard.
 *
 * Blocks ALL /api/shuffle network (pool=full&force, countOnly, warmup, q=)
 * while the search field is focused or recently typed — including the live F6
 * remount race where focusout clears React focus but mount effects re-fire
 * force+countOnly inside the typing window (value often lands as "n").
 *
 * Suppression is sticky across brief blur/remount: blur does not clear the idle
 * window. Fire-time checks re-sync from document.activeElement. Deferred
 * network is never flushed while suppressed; on idle it is dropped (TTL /
 * next poll can refresh later). No new APIs.
 */

import {
  recordQaCriticalEvent,
  setQaShuffleDiagnosticState,
} from "@/lib/qa/realDeviceQaDebug";

const SEARCH_TYPING_IDLE_MS = 2500;
/** Extra sticky suppress after blur so remount mount-effects cannot race. */
const SEARCH_BLUR_STICKY_MS = 2500;
const SEARCH_INPUT_SELECTOR =
  'input[placeholder*="Buscar"], input[name="search"], input[type="search"], input[aria-label*="Buscar"], input[data-shuffle-search="1"]';

let typingActive = false;
let searchFocused = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let deferredPoolLoad: { q: string; force: boolean } | null = null;
let deferredCountOnly = false;
let domBridgeInstalled = false;
let lastArmedAt = 0;

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

/**
 * Re-sync module flags from the live DOM. Survives remount that briefly
 * nulled searchFocused while the input (or a replacement) still owns focus.
 */
function syncFromLiveDom() {
  if (typeof document === "undefined") return;
  if (isShuffleSearchInput(document.activeElement)) {
    searchFocused = true;
    typingActive = true;
    lastArmedAt = Date.now();
  }
}

function networkSuppressed() {
  syncFromLiveDom();
  if (searchFocused || typingActive) return true;
  // Sticky window after last arm — covers remount blur → mount fetch race.
  if (lastArmedAt > 0 && Date.now() - lastArmedAt < SEARCH_BLUR_STICKY_MS) {
    return true;
  }
  return false;
}

function armTypingIdle() {
  clearIdleTimer();
  lastArmedAt = Date.now();
  idleTimer = setTimeout(() => {
    typingActive = false;
    idleTimer = null;
    // Never flush while the search field still owns focus — that is what
    // landed pool=full&force + countOnly inside F6 typing windows after idle.
    syncFromLiveDom();
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
  // CRITICAL (F6 live): do NOT clear typingActive / idle on blur.
  // Remount detaches the input → focusout → blur → mount force+countOnly
  // while Playwright still measures the typing window (value often "n").
  // Keep sticky suppress until idle; drop deferred so blur never flushes.
  dropDeferredNetwork();
  typingActive = true;
  armTypingIdle();
}

export function isShuffleSearchTypingActive() {
  return networkSuppressed();
}

/**
 * Authoritative fire-time gate for ANY /api/shuffle request.
 * Returns true when the caller must not fetch.
 */
export function shouldSuppressShuffleNetworkAtFireTime() {
  ensureShuffleSearchTypingGuardInstalled();
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
        if (isShuffleSearchInput(active)) {
          markShuffleSearchFocused();
          return;
        }
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

/**
 * Central /api/shuffle fetch wrapper — checks suppression synchronously at
 * fire time (including warmup / mount / TTL / countOnly). Throws AbortError
 * when suppressed so callers treat it like a cancelled request.
 */
export async function fetchShuffleApi(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  ensureShuffleSearchTypingGuardInstalled();
  if (shouldSuppressShuffleNetworkAtFireTime()) {
    const err = new DOMException("Shuffle network suppressed during search typing", "AbortError");
    throw err;
  }
  setQaShuffleDiagnosticState({
    shufflePoolStatus: "loading",
    shuffleLastApiUrl: input,
    shuffleLastApiStatus: null,
    shuffleLastApiError: null,
  });
  try {
    const response = await fetch(input, { cache: "no-store", ...init });
    const contentType = response.headers.get("content-type") || "";
    setQaShuffleDiagnosticState({
      shufflePoolStatus: response.ok ? "response" : "http-error",
      shuffleLastApiUrl: input,
      shuffleLastApiStatus: response.status,
      shuffleLastApiContentType: contentType,
      shuffleLastApiError: response.ok ? null : `HTTP ${response.status}`,
    });
    recordQaCriticalEvent("shuffle", "SHUFFLE_API_RESPONSE", {
      url: input,
      status: response.status,
      contentType,
    });
    return response;
  } catch (error) {
    const message = String((error as Error)?.message || error || "fetch failed");
    setQaShuffleDiagnosticState({
      shufflePoolStatus: "network-error",
      shuffleLastApiUrl: input,
      shuffleLastApiStatus: null,
      shuffleLastApiError: message,
    });
    recordQaCriticalEvent("shuffle", "SHUFFLE_API_ERROR", {
      url: input,
      message,
    });
    throw error;
  }
}

export function getShuffleSearchTypingDebug() {
  return {
    typingActive,
    searchFocused,
    deferredPoolLoad,
    deferredCountOnly,
    idleMs: SEARCH_TYPING_IDLE_MS,
    blurStickyMs: SEARCH_BLUR_STICKY_MS,
    lastArmedAt,
    domBridgeInstalled,
    // flushers retained for diagnostics only — not invoked while focused
    hasFlushers: Boolean(flushPoolLoad || flushCountOnly),
    suppressed: networkSuppressed(),
  };
}
