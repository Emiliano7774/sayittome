/**
 * A displayed arrival must stay consumed when Providers is remounted by a tab
 * navigation or when the Firestore "latest" snapshot is replayed from cache.
 * Session-scoped, bounded, user-scoped; no extra Firestore operations.
 */
const STORAGE_KEY = "sayittome:arrival-toast-receipts:v1";
const RECEIPT_LIFETIME_MS = 10 * 60_000;
const DEEP_LINK_LIFETIME_MS = 45_000;
const SAME_PERSON_BURST_MS = 15 * 60_000;
const MAX_RECEIPTS = 600;
const memory = new Map<string, number>();

function validScope(uid: string) {
  return String(uid || "").trim().slice(0, 128);
}

function readReceipts() {
  if (typeof window === "undefined") return;
  // Native WebViews and independent browser tabs may recreate sessionStorage.
  // Merge persistent and session receipts so an already dismissed arrival
  // cannot be replayed when Providers / Firebase listeners are remounted.
  for (const storageType of ["localStorage", "sessionStorage"] as const) {
    try {
      const raw = window[storageType].getItem(STORAGE_KEY);
      if (!raw) continue;
      const json = JSON.parse(raw) as Record<string, unknown>;
      if (!json || typeof json !== "object" || Array.isArray(json)) continue;
      for (const [key, expiry] of Object.entries(json)) {
        if (Number.isFinite(expiry) && (expiry as number) > Date.now() && key.length < 350) {
          memory.set(key, Math.max(memory.get(key) || 0, expiry as number));
        }
      }
    } catch { /* storage may be disabled; in-memory dedupe still works */ }
  }
}

function writeReceipts(now: number) {
  for (const [key, expiry] of memory) {
    if (expiry <= now) memory.delete(key);
  }
  while (memory.size > MAX_RECEIPTS) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    memory.delete(oldest);
  }
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(Object.fromEntries(memory));
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try { window[kind].setItem(STORAGE_KEY, serialized); }
    catch { /* optional in private browsing; memory remains authoritative */ }
  }
}

function receiptKey(uid: string, alias: string, enteredAt: string) {
  return `event:${uid}:${alias}:${enteredAt}`;
}

function aliasKey(uid: string, alias: string) {
  return `opened:${uid}:${alias}`;
}
function displayedPersonKey(uid: string, alias: string) {
  return `displayed:${uid}:${alias}`;
}
function deviceEventKey(alias: string, enteredAt: string) {
  return `device-event:${alias}:${enteredAt}`;
}
function devicePersonKey(alias: string) {
  return `device-display:${alias}`;
}
function deviceOpenedKey(alias: string) {
  return `device-opened:${alias}`;
}

/** Marks an entry displayed BEFORE painting it. A replay of the same entry is ignored. */
export function consumeAnonArrivalToastOnce(
  uid: string, alias: string, enteredAt: string, now = Date.now(),
) {
  const viewer = validScope(uid);
  if (!viewer || !alias || !enteredAt) return false;
  readReceipts();
  const key = receiptKey(viewer, alias, enteredAt);
  if ((memory.get(key) || 0) > now ||
      (memory.get(aliasKey(viewer, alias)) || 0) > now ||
      (memory.get(displayedPersonKey(viewer, alias)) || 0) > now ||
      (memory.get(deviceEventKey(alias, enteredAt)) || 0) > now ||
      (memory.get(devicePersonKey(alias)) || 0) > now ||
      (memory.get(deviceOpenedKey(alias)) || 0) > now) {
    return false;
  }
  memory.set(key, now + RECEIPT_LIFETIME_MS);
  memory.set(deviceEventKey(alias, enteredAt), now + RECEIPT_LIFETIME_MS);
  // Same viewer may be rehydrated with a different anonymous auth UID.
  // Keep a local device receipt too, so navigation never replays this person.
  memory.set(displayedPersonKey(viewer, alias), now + SAME_PERSON_BURST_MS);
  memory.set(devicePersonKey(alias), now + SAME_PERSON_BURST_MS);
  writeReceipts(now);
  return true;
}

/** Tapping a system notification/deep link consumes the corresponding active entry. */
export function markAnonArrivalActionHandled(uid: string, alias: string, now = Date.now()) {
  const viewer = validScope(uid);
  if (!alias) return;
  readReceipts();
  if (viewer) memory.set(aliasKey(viewer, alias), now + DEEP_LINK_LIFETIME_MS);
  // A deep link may be handled before Firebase auth hydration. It must still
  // consume the pending banner when the viewer UID becomes available.
  memory.set(deviceOpenedKey(alias), now + DEEP_LINK_LIFETIME_MS);
  writeReceipts(now);
}

/** One OS foreground connection banner per profile/anonymous person, across
 * WebView recreation, native tab changes and web notification callbacks.
 * New arrivals of the same person are eligible again after the server's
 * existing 15-minute reannounce window. No Firestore reads or writes. */
export function consumeForegroundConnectionNoticeOnce(
  uid: string, principal: string, now = Date.now(),
) {
  if (!principal) return false;
  readReceipts();
  const key = `os-arrival:${validScope(uid) || "device"}:${principal.toLowerCase()}`;
  const deviceKey = `os-arrival-device:${principal.toLowerCase()}`;
  if ((memory.get(key) || 0) > now || (memory.get(deviceKey) || 0) > now) {
    return false;
  }
  memory.set(key, now + SAME_PERSON_BURST_MS);
  memory.set(deviceKey, now + SAME_PERSON_BURST_MS);
  writeReceipts(now);
  return true;
}
