const RECENT_MATCH_TARGETS_KEY = "sayittome:anon-match:recent-targets";
const RECENT_MATCH_TARGETS_MAX = 80;

function readOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RECENT_MATCH_TARGETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(-RECENT_MATCH_TARGETS_MAX);
  } catch {
    return [];
  }
}

function writeOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      RECENT_MATCH_TARGETS_KEY,
      JSON.stringify(ids.slice(-RECENT_MATCH_TARGETS_MAX)),
    );
  } catch {
    // Ignore storage quota / privacy mode.
  }
}

export function loadRecentMatchTargets() {
  return readOrder();
}

/**
 * Move a just-contacted target to the end of the searcher's queue.
 * Never-tried people stay ahead; older contacts stay ahead of newer ones.
 */
export function rememberRecentMatchTarget(key: string) {
  const trimmed = String(key || "").trim();
  if (!trimmed) return;
  const next = readOrder().filter((id) => id !== trimmed);
  next.push(trimmed);
  writeOrder(next);
}

export function clearRecentMatchTargets() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RECENT_MATCH_TARGETS_KEY);
  } catch {
    // ignore
  }
}

/** -1 = never tried (front of queue). Higher = more recently contacted (back). */
export function recentMatchTargetRank(id: string, order: string[] = loadRecentMatchTargets()) {
  const key = String(id || "").trim();
  if (!key) return Number.MAX_SAFE_INTEGER;
  const index = order.indexOf(key);
  return index === -1 ? -1 : index;
}
