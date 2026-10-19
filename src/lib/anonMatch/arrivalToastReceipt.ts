/**
 * A displayed arrival must stay consumed when Providers is remounted by a tab
 * navigation or when the Firestore "latest" snapshot is replayed from cache.
 * Session-scoped, bounded, user-scoped; no extra Firestore operations.
 */
const STORAGE_KEY = "sayittome:arrival-toast-receipts:v1";
const RECEIPT_LIFETIME_MS = 10 * 60_000;
const DEEP_LINK_LIFETIME_MS = 45_000;
// Only suppress duplicate entrances within the server's one-minute cooldown.
// Returning after a full minute must show again, even for the 500th return.
const SAME_PERSON_BURST_MS = 60_000;
const MAX_RECEIPTS = 600;
const memory = new Map<string, number>();

function validScope(uid: string) {
  return String(uid || "").trim().slice(0, 128);
}

function readReceipts() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (!json || typeof json !== "object" || Array.isArray(json)) return;
    for (const [key, expiry] of Object.entries(json)) {
      if (Number.isFinite(expiry) && (expiry as number) > Date.now() && key.length < 350) {
        memory.set(key, expiry as number);
      }
    }
  } catch { /* storage is optional; in-memory dedupe continues */ }
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
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch { /* ignore browsers without sessionStorage access */ }
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
      (memory.get(displayedPersonKey(viewer, alias)) || 0) > now) {
    return false;
  }
  memory.delete(key);
  memory.set(key, now + RECEIPT_LIFETIME_MS);
  // Duplicate writes for the same entrance are hidden, but a legitimate
  // reconnection after >=60 seconds must be visible again.
  memory.set(displayedPersonKey(viewer, alias), now + SAME_PERSON_BURST_MS);
  writeReceipts(now);
  return true;
}

/** Tapping a system notification/deep link consumes the corresponding active entry. */
export function markAnonArrivalActionHandled(uid: string, alias: string, now = Date.now()) {
  const viewer = validScope(uid);
  if (!viewer || !alias) return;
  readReceipts();
  const key = aliasKey(viewer, alias);
  memory.delete(key);
  memory.set(key, now + DEEP_LINK_LIFETIME_MS);
  writeReceipts(now);
}
