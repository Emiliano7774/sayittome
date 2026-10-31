/**
 * Persisted throttle for AUTOMATIC push maintenance calls (token reconcile and
 * the arrival topic sync). It must survive reloads and new tabs: an in-memory
 * guard restarts with every page, so automatic retries would repeat per page
 * load and run into the callables' rate limits.
 * Explicit user actions never consult it. Records hold a uid and a token hash,
 * never a raw FCM token.
 */
export type PushSyncRecord = {
  uid: string;
  tokenHash: string;
  okAt: number;
  failures: number;
  retryAt: number;
};

type SyncStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Waits after 1, 2, 3, 4 and 5+ consecutive automatic failures. */
export const PUSH_SYNC_RETRY_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export function readPushSyncRecord(
  store: SyncStore | null | undefined,
  key: string,
): PushSyncRecord | null {
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(key) || "null") as Partial<PushSyncRecord> | null;
    if (!parsed || typeof parsed.uid !== "string" || !parsed.uid) return null;
    return {
      uid: parsed.uid,
      tokenHash: String(parsed.tokenHash || ""),
      okAt: Number(parsed.okAt) || 0,
      failures: Math.max(0, Math.floor(Number(parsed.failures) || 0)),
      retryAt: Number(parsed.retryAt) || 0,
    };
  } catch {
    return null;
  }
}

function writeRecord(store: SyncStore | null | undefined, key: string, record: PushSyncRecord) {
  try {
    store?.setItem(key, JSON.stringify(record));
  } catch {
    // Quota or private mode: the call simply is not throttled.
  }
}

/**
 * "fresh": the server confirmed this uid/token recently, skip the call.
 * "backoff": the last automatic attempts failed, wait before calling again.
 * null: call now. A different uid or token hash always calls now.
 */
export function automaticPushSyncSkip(
  record: PushSyncRecord | null,
  input: { uid: string; tokenHash?: string; now: number; freshMs: number },
): "fresh" | "backoff" | null {
  if (!record || !input.uid || record.uid !== input.uid) return null;
  if (input.tokenHash && record.tokenHash && record.tokenHash !== input.tokenHash) return null;
  const age = input.now - record.okAt;
  if (record.okAt > 0 && age >= 0 && age < input.freshMs) return "fresh";
  if (record.failures > 0 && record.retryAt > input.now) return "backoff";
  return null;
}

export function writePushSyncSuccess(
  store: SyncStore | null | undefined,
  key: string,
  input: { uid: string; tokenHash: string; now: number },
) {
  writeRecord(store, key, {
    uid: input.uid,
    tokenHash: input.tokenHash,
    okAt: input.now,
    failures: 0,
    retryAt: 0,
  });
}

export function writePushSyncFailure(
  store: SyncStore | null | undefined,
  key: string,
  input: { uid: string; tokenHash: string; now: number },
): PushSyncRecord {
  const prior = readPushSyncRecord(store, key);
  const same = Boolean(prior && prior.uid === input.uid &&
    (!input.tokenHash || !prior.tokenHash || prior.tokenHash === input.tokenHash));
  const failures = (same && prior ? prior.failures : 0) + 1;
  const wait = PUSH_SYNC_RETRY_MS[Math.min(failures, PUSH_SYNC_RETRY_MS.length) - 1];
  const next: PushSyncRecord = {
    uid: input.uid,
    tokenHash: input.tokenHash || (same && prior ? prior.tokenHash : ""),
    okAt: 0,
    failures,
    retryAt: input.now + wait,
  };
  writeRecord(store, key, next);
  return next;
}

export function clearPushSyncRecord(store: SyncStore | null | undefined, key: string) {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}
