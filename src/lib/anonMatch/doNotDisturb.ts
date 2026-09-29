/** Allowed "No molestar durante" durations for incoming anon-match. */
export const ANON_MATCH_DND_MINUTE_OPTIONS = [5, 15, 30, 60] as const;
export const ANON_MATCH_DND_MIN_MINUTES = 5;
export const ANON_MATCH_DND_MAX_MINUTES = 120;

const LOCAL_DND_UNTIL_KEY = "sayittome:anon-match:dnd-until";

export function normalizeAnonMatchDndMinutes(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const minutes = Math.floor(n);
  if (minutes < ANON_MATCH_DND_MIN_MINUTES || minutes > ANON_MATCH_DND_MAX_MINUTES) {
    return null;
  }
  return minutes;
}

export function isAnonMatchDoNotDisturbActive(
  untilIso: string | null | undefined,
  now = Date.now(),
): boolean {
  const raw = String(untilIso || "").trim();
  if (!raw) return false;
  const until = new Date(raw);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now;
}

export function readLocalAnonMatchDndUntil(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(LOCAL_DND_UNTIL_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeLocalAnonMatchDndUntil(untilIso: string) {
  if (typeof window === "undefined") return;
  try {
    const value = String(untilIso || "").trim();
    if (!value) {
      window.sessionStorage.removeItem(LOCAL_DND_UNTIL_KEY);
      return;
    }
    window.sessionStorage.setItem(LOCAL_DND_UNTIL_KEY, value);
  } catch {
    // ignore
  }
}

export function isLocalAnonMatchDndActive(now = Date.now()): boolean {
  return isAnonMatchDoNotDisturbActive(readLocalAnonMatchDndUntil(), now);
}
