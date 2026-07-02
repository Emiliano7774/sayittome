import {
  getCachedFullProfile,
  setCachedFullProfile,
} from "@/lib/profile/profileCache";

const PREFETCH_INTENT_MS = 200;
const USERNAME_COOLDOWN_MS = 5 * 60_000;
const MAX_PREFETCHES_PER_SESSION = 5;
const SCROLL_SUPPRESS_MS = 180;

type PendingPrefetch = {
  timer: number;
  abort: AbortController;
};

type ProfilePrefetchMetrics = {
  /** Timers that completed and started a network prefetch. */
  fired: number;
  /** Timers scheduled (includes cancelled). */
  scheduled: number;
  /** Timers cancelled before firing. */
  cancelled: number;
  /** Blocked by session cap, cooldown, cache, network, or scroll. */
  skipped: number;
  /** Currently waiting for intent delay. */
  pending: number;
};

const recentPrefetchedAt = new Map<string, number>();
const prefetchInflight = new Map<string, Promise<void>>();
const inflightAbortByKey = new Map<string, AbortController>();
const pendingByKey = new Map<string, PendingPrefetch>();

let scrollSuppressUntil = 0;
let sessionFired = 0;

const metrics: ProfilePrefetchMetrics = {
  fired: 0,
  scheduled: 0,
  cancelled: 0,
  skipped: 0,
  pending: 0,
};

function normalizeKey(username: string) {
  return username.trim().toLowerCase();
}

function isPrefetchBlockedByNetwork() {
  if (typeof navigator === "undefined") return true;

  const connection = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
        rtt?: number;
        downlink?: number;
      };
    }
  ).connection;

  if (!connection) return false;
  if (connection.saveData) return true;

  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  if (effectiveType === "slow-2g" || effectiveType === "2g") return true;

  if (typeof connection.rtt === "number" && connection.rtt >= 450) return true;
  if (typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 0.5) {
    return true;
  }

  return false;
}

function isScrollActive() {
  return Date.now() < scrollSuppressUntil;
}

function syncPendingMetric() {
  metrics.pending = pendingByKey.size;
}

function shouldSkipPrefetch(key: string) {
  if (!key || typeof window === "undefined") return true;
  if (isScrollActive()) return true;
  if (isPrefetchBlockedByNetwork()) return true;
  if (getCachedFullProfile(key)) return true;

  const lastPrefetched = recentPrefetchedAt.get(key);
  if (lastPrefetched && Date.now() - lastPrefetched < USERNAME_COOLDOWN_MS) {
    return true;
  }

  if (sessionFired >= MAX_PREFETCHES_PER_SESSION) return true;
  return false;
}

function cancelPendingForKey(key: string) {
  const pending = pendingByKey.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pending.abort.abort();
    pendingByKey.delete(key);
    metrics.cancelled += 1;
    syncPendingMetric();
  }

  const inflightAbort = inflightAbortByKey.get(key);
  if (inflightAbort) {
    inflightAbort.abort();
    inflightAbortByKey.delete(key);
    metrics.cancelled += 1;
  }
}

function cancelAllPendingPrefetches() {
  for (const key of [...pendingByKey.keys()]) {
    cancelPendingForKey(key);
  }
}

export function markProfilePrefetchScroll() {
  scrollSuppressUntil = Date.now() + SCROLL_SUPPRESS_MS;
  cancelAllPendingPrefetches();
}

/** Schedule prefetch after sustained hover/touch intent (not instant). */
export function scheduleProfilePrefetch(username: string) {
  const key = normalizeKey(username);
  if (!key) return;

  cancelAllPendingPrefetches();

  if (shouldSkipPrefetch(key)) {
    metrics.skipped += 1;
    return;
  }

  const abort = new AbortController();
  const timer = window.setTimeout(() => {
    pendingByKey.delete(key);
    syncPendingMetric();

    if (abort.signal.aborted || shouldSkipPrefetch(key)) {
      metrics.skipped += 1;
      return;
    }

    recentPrefetchedAt.set(key, Date.now());
    sessionFired += 1;
    metrics.fired += 1;

    void executeProfilePrefetch(username, key, abort);
  }, PREFETCH_INTENT_MS);

  pendingByKey.set(key, { timer, abort });
  metrics.scheduled += 1;
  syncPendingMetric();
}

/** Cancel a pending intent when the pointer leaves or user moves to another row. */
export function cancelProfilePrefetch(username?: string) {
  if (!username) {
    cancelAllPendingPrefetches();
    return;
  }
  cancelPendingForKey(normalizeKey(username));
}

async function executeProfilePrefetch(
  username: string,
  key: string,
  abort: AbortController,
) {
  if (abort.signal.aborted || prefetchInflight.has(key)) return;

  inflightAbortByKey.set(key, abort);

  const promise = (async () => {
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}?prefetch=1`, {
        cache: "no-store",
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;

      const json = await res.json();
      if (json?.profile) {
        setCachedFullProfile(key, json.profile);
        const photo = String(
          json.profile.fotoPrincipal || json.profile.photo || "",
        ).trim();
        if (photo && !abort.signal.aborted) {
          const img = new Image();
          img.decoding = "async";
          img.src = photo;
        }
      }
    } catch {
      // Best-effort prefetch.
    } finally {
      prefetchInflight.delete(key);
      inflightAbortByKey.delete(key);
    }
  })();

  prefetchInflight.set(key, promise);
}

export function getProfilePrefetchSessionMetrics(): Readonly<ProfilePrefetchMetrics> {
  syncPendingMetric();
  return { ...metrics };
}

if (typeof window !== "undefined") {
  const onScrollActivity = () => markProfilePrefetchScroll();

  window.addEventListener("scroll", onScrollActivity, { passive: true, capture: true });
  window.addEventListener("touchmove", onScrollActivity, { passive: true, capture: true });
  window.addEventListener("wheel", onScrollActivity, { passive: true, capture: true });

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    (
      window as Window & { __sayittomeProfilePrefetchMetrics?: () => ProfilePrefetchMetrics }
    ).__sayittomeProfilePrefetchMetrics = getProfilePrefetchSessionMetrics;
  }
}
