/**
 * Session-scoped Shuffle leave snapshot: ordered window, filters/mode, batch
 * pages, scroll + anchor. Survives remount within the same browser session /
 * account; cleared on logout, manual reshuffle, or explicit filter reset.
 */
import {
  defaultShuffleFilters,
  loadStoredShuffleFilters,
  type ShuffleFilters,
} from "@/lib/shuffle/filters";
import {
  captureShuffleViewportSnapshot,
  clearShuffleViewportSnapshot,
  isUsableShuffleViewportSnapshot,
  peekShuffleViewportSnapshot,
  type ShuffleViewportSnapshot,
} from "@/lib/navigation/shuffleViewportSnapshot";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import {
  capturePinnedShuffleWindow,
  clearPinnedShuffleWindow,
} from "@/lib/shuffle/shufflePinnedWindow";
import { SHUFFLE_WINDOW_SIZE } from "@/lib/shuffle/pickWindow";

export const SHUFFLE_SESSION_UID_ANON = "anon";

export function shuffleFiltersFingerprint(filters: ShuffleFilters, search = "") {
  return JSON.stringify({
    ...filters,
    intereses: [...(filters.intereses || [])].sort(),
    search: String(search || "").trim(),
  });
}

export function readShuffleSessionUid(): string {
  if (typeof window === "undefined") return SHUFFLE_SESSION_UID_ANON;
  try {
    const raw = window.sessionStorage.getItem("sayittome:auth-uid");
    if (raw && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return SHUFFLE_SESSION_UID_ANON;
}

/**
 * Bind the active auth uid to the shuffle session envelope.
 * Ignores null/empty (auth bootstrap flicker). Clears snapshot only when the
 * previous bound uid is a real value and the next uid is a different real value.
 */
export function bindShuffleSessionUid(uid: string | null | undefined): {
  bound: boolean;
  cleared: boolean;
  prev: string;
  next: string;
} {
  if (typeof window === "undefined") {
    return { bound: false, cleared: false, prev: "", next: "" };
  }
  const next = String(uid || "").trim();
  // Transient null during authStateReady / sign-in handoff — keep prior bind.
  if (!next) {
    return {
      bound: false,
      cleared: false,
      prev: readShuffleSessionUid(),
      next: "",
    };
  }

  try {
    const prev = String(window.sessionStorage.getItem("sayittome:auth-uid") || "").trim();
    let cleared = false;
    if (prev && prev !== next) {
      clearShuffleSessionSnapshot();
      cleared = true;
    }
    window.sessionStorage.setItem("sayittome:auth-uid", next);
    return { bound: true, cleared, prev, next };
  } catch {
    return { bound: false, cleared: false, prev: "", next };
  }
}

type LiveCaptureContext = {
  filters: ShuffleFilters;
  search: string;
  batchPages: string[][];
};

let liveCaptureContext: LiveCaptureContext | null = null;

/** Pool publishes live filters/search/batch so modern cards capture full session extras. */
export function publishShuffleSessionCaptureContext(input: {
  filters: ShuffleFilters;
  search?: string;
  batchPages?: string[][];
}) {
  liveCaptureContext = {
    filters: input.filters,
    search: String(input.search || ""),
    batchPages: (input.batchPages || []).map((page) => page.map(String)),
  };
}

export function peekShuffleSessionCaptureContext(): LiveCaptureContext | null {
  return liveCaptureContext
    ? {
        filters: liveCaptureContext.filters,
        search: liveCaptureContext.search,
        batchPages: liveCaptureContext.batchPages.map((page) => page.slice()),
      }
    : null;
}

export type ShuffleSessionCaptureInput = {
  cardId?: string;
  index?: number;
  scrollTop?: number;
  cardIds?: string[];
  filters?: ShuffleFilters;
  search?: string;
  batchPages?: string[][];
  sessionUid?: string;
  pinVisibleWindow?: boolean;
};

/** Capture leave snapshot + optional in-memory pin from current visible order. */
export function captureShuffleSessionSnapshot(input?: ShuffleSessionCaptureInput) {
  const visible = getVisibleShuffleProfiles();
  const cardIds =
    input?.cardIds ??
    visible
      .map((row) => shuffleProfileIdentityKey(row) || row.username)
      .filter(Boolean);

  const live = peekShuffleSessionCaptureContext();
  const filters =
    input?.filters || live?.filters || loadStoredShuffleFilters() || defaultShuffleFilters();
  const search =
    input?.search !== undefined
      ? String(input.search || "")
      : String(live?.search || "");
  const batchPages =
    input?.batchPages || live?.batchPages || [];

  const snapshot = captureShuffleViewportSnapshot({
    cardId: input?.cardId,
    index: input?.index,
    scrollTop: input?.scrollTop,
    cardIds,
  });

  if (isUsableShuffleViewportSnapshot(snapshot)) {
    persistSessionExtras({
      filterFingerprint: shuffleFiltersFingerprint(filters, search),
      search,
      batchPages,
      sessionUid: input?.sessionUid || readShuffleSessionUid(),
      cardIds: snapshot.cardIds,
      cardId: snapshot.cardId,
      index: snapshot.index,
      scrollTop: snapshot.scrollTop,
    });
  }

  if (input?.pinVisibleWindow !== false && visible.length > 0) {
    const indices = new Int32Array(SHUFFLE_WINDOW_SIZE);
    const count = Math.min(visible.length, SHUFFLE_WINDOW_SIZE);
    for (let slot = 0; slot < count; slot += 1) indices[slot] = slot;
    capturePinnedShuffleWindow([], visible, indices, count);
  }

  return snapshot;
}

const SESSION_EXTRAS_KEY = "sayittome:shuffle-session-extras:v1";

export type ShuffleSessionExtras = {
  filterFingerprint: string;
  search: string;
  batchPages: string[][];
  sessionUid: string;
  cardIds: string[];
  cardId: string;
  index: number;
  scrollTop: number;
};

function persistSessionExtras(extras: ShuffleSessionExtras) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_EXTRAS_KEY, JSON.stringify(extras));
  } catch {
    /* quota */
  }
}

export function peekShuffleSessionExtras(): ShuffleSessionExtras | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_EXTRAS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShuffleSessionExtras;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.sessionUid && parsed.sessionUid !== readShuffleSessionUid()) {
      return null;
    }
    return {
      filterFingerprint: String(parsed.filterFingerprint || ""),
      search: String(parsed.search || ""),
      batchPages: Array.isArray(parsed.batchPages)
        ? parsed.batchPages.map((page) =>
            Array.isArray(page) ? page.map(String) : [],
          )
        : [],
      sessionUid: String(parsed.sessionUid || SHUFFLE_SESSION_UID_ANON),
      cardIds: Array.isArray(parsed.cardIds) ? parsed.cardIds.map(String) : [],
      cardId: String(parsed.cardId || ""),
      index: Number(parsed.index) || 0,
      scrollTop: Number(parsed.scrollTop) || 0,
    };
  } catch {
    return null;
  }
}

export function clearShuffleSessionSnapshot() {
  clearShuffleViewportSnapshot();
  clearPinnedShuffleWindow();
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_EXTRAS_KEY);
  } catch {
    /* ignore */
  }
}

export function hasUsableShuffleSessionSnapshot() {
  if (isUsableShuffleViewportSnapshot(peekShuffleViewportSnapshot())) return true;
  const extras = peekShuffleSessionExtras();
  return Boolean(extras?.cardId && extras.cardIds.length > 0);
}

export function shouldResetShuffleSessionForFilterChange(input: {
  previousFingerprint: string;
  nextFilters: ShuffleFilters;
  nextSearch?: string;
}) {
  return (
    input.previousFingerprint !==
    shuffleFiltersFingerprint(input.nextFilters, input.nextSearch || "")
  );
}

export type { ShuffleViewportSnapshot };
