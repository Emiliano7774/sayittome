"use client";

/** Session-scoped clock for real browser background -> foreground transitions.
 * Android/Brave can suspend outbound requests on blur; the return clock must
 * not depend on an exit request reaching the server. No network or polling.
 */
const PREFIX = "sayittome:browser-away-since:v1:";
const memory = new Map<string, number>();
function storageKey(kind: "anon" | "profile", uid: string) {
  return PREFIX + kind + ":" + uid;
}
function read(kind: "anon" | "profile", uid: string): number {
  if (!uid) return 0;
  const key = storageKey(kind, uid);
  try {
    const stored = Number(sessionStorage.getItem(key) || 0);
    if (Number.isFinite(stored) && stored > 0) return stored;
  } catch { /* private browser: in-memory fallback */ }
  return memory.get(key) || 0;
}
export const BROWSER_REANNOUNCE_AFTER_MS = 60_000;
export function markBrowserAway(kind: "anon" | "profile", uid: string, now = Date.now()) {
  if (!uid || !Number.isFinite(now) || now <= 0) return;
  if (read(kind, uid)) return; // blur+visibilitychange preserve original time.
  const key = storageKey(kind, uid);
  memory.set(key, now);
  try { sessionStorage.setItem(key, String(now)); } catch { /* fallback */ }
}
export function browserAwaySince(kind: "anon" | "profile", uid: string, now = Date.now()) {
  const stamp = read(kind, uid);
  return stamp > 0 && Number.isFinite(now) && now - stamp >= BROWSER_REANNOUNCE_AFTER_MS
    ? stamp : 0;
}
export function clearBrowserAway(kind: "anon" | "profile", uid: string) {
  const key = storageKey(kind, uid);
  memory.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* fallback */ }
}
