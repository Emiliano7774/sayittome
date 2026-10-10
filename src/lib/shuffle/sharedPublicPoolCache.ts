import { gunzipSync, gzipSync } from "node:zlib";

/**
 * One sanitized Shuffle catalogue shared by all Cloud Run SSR instances.
 * Stored under system/*: Firestore rules exclude it from client access.
 * Keep its age below the existing 10-minute per-instance freshness contract.
 */
const SHARED_TTL_MS = 4 * 60_000;
const MAX_EXISTING_AGE_MS = 10 * 60_000;
const LEASE_MS = 30_000;
const MAX_BASE64_BYTES = 800_000;
const SHARED_DOC = "shuffle_public_pool_v1";

type Cached<T> = { items: T[]; refreshedAtMs: number };
type CacheDecision =
  | { kind: "hit"; payload: string; refreshedAtMs: number }
  | { kind: "wait"; payload: string; refreshedAtMs: number }
  | { kind: "rebuild" };

export function packSharedPool<T>(items: T[]): string {
  return gzipSync(Buffer.from(JSON.stringify(items)), { level: 5 }).toString("base64");
}

export function unpackSharedPool<T>(payload: string): T[] {
  const decoded: unknown = JSON.parse(
    gunzipSync(Buffer.from(payload, "base64")).toString("utf8"),
  );
  if (!Array.isArray(decoded)) throw new Error("invalid_shared_shuffle_pool");
  return decoded as T[];
}

export function sharedPoolWithinAge(
  refreshedAtMs: number,
  nowMs: number,
  maxAgeMs: number,
) {
  return refreshedAtMs > 0 && refreshedAtMs <= nowMs &&
    nowMs - refreshedAtMs < maxAgeMs;
}

function decodeIfUsable<T>(
  payload: string,
  refreshedAtMs: number,
  maxAgeMs: number,
): Cached<T> | null {
  if (!payload || !sharedPoolWithinAge(refreshedAtMs, Date.now(), maxAgeMs)) {
    return null;
  }
  try {
    const items = unpackSharedPool<T>(payload);
    return items.length ? { items, refreshedAtMs } : null;
  } catch {
    return null;
  }
}

/**
 * No extra reads when a server instance's existing 10-minute memory cache hits.
 * A cold instance does one Admin Firestore document read instead of scanning
 * the full usuarios collection. One lease holder rebuilds on expiration.
 * On any cache infrastructure failure, the original direct scan still works.
 */
export async function readOrBuildSharedPublicPool<T>(
  directScan: () => Promise<T[]>,
): Promise<Cached<T>> {
  let ref: any;
  try {
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    ref = getRepairAdminDb().collection("system").doc(SHARED_DOC);
  } catch {
    const items = await directScan();
    return { items, refreshedAtMs: Date.now() };
  }

  let scanFailure: unknown = null;
  try {
    for (const delayMs of [0, 450, 750, 1000]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const decision: CacheDecision = await ref.firestore.runTransaction(
        async (tx: any): Promise<CacheDecision> => {
          const snap = await tx.get(ref);
          const data = (snap.data() || {}) as Record<string, unknown>;
          const payload = String(data.payload || "");
          const refreshedAtMs = Number(data.refreshedAtMs || 0);
          const nowMs = Date.now();
          if (payload && sharedPoolWithinAge(refreshedAtMs, nowMs, SHARED_TTL_MS)) {
            return { kind: "hit", payload, refreshedAtMs };
          }
          if (Number(data.leaseUntilMs || 0) > nowMs) {
            return { kind: "wait", payload, refreshedAtMs };
          }
          tx.set(ref, { leaseUntilMs: nowMs + LEASE_MS }, { merge: true });
          return { kind: "rebuild" };
        },
      );

      if (decision.kind === "hit") {
        const cached = decodeIfUsable<T>(
          decision.payload, decision.refreshedAtMs, SHARED_TTL_MS,
        );
        if (cached) return cached;
      }
      if (decision.kind === "wait") {
        // Existing clients could already retain this snapshot for 10 minutes.
        // Returning it while a new rebuild runs is not a freshness regression.
        const stale = decodeIfUsable<T>(
          decision.payload, decision.refreshedAtMs, MAX_EXISTING_AGE_MS,
        );
        if (stale) return stale;
        continue;
      }
      if (decision.kind === "rebuild") {
        let items: T[];
        try {
          items = await directScan();
        } catch (error) {
          scanFailure = error;
          await ref.set({ leaseUntilMs: 0 }, { merge: true }).catch(() => {});
          throw error;
        }
        const refreshedAtMs = Date.now();
        try {
          const payload = packSharedPool(items);
          if (items.length > 0 && payload.length <= MAX_BASE64_BYTES) {
            await ref.set(
              { payload, refreshedAtMs, leaseUntilMs: 0, format: "gzip-base64-v1" },
              { merge: true },
            );
          } else {
            await ref.set({ leaseUntilMs: 0 }, { merge: true });
          }
        } catch {
          // A failed cache write must never break the current Shuffle request.
        }
        return { items, refreshedAtMs };
      }
    }
  } catch {
    // Cache failure: recover via the original direct scan, but never retry a
    // scan that already failed (duplicate reads and a misleading error).
    if (scanFailure !== null) throw scanFailure;
  }
  const items = await directScan();
  return { items, refreshedAtMs: Date.now() };
}
