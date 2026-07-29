/**
 * Deduped Shuffle pool warmup for main-tab → Shuffle micro-slide (fresh/anon).
 * Uses existing cached `/api/shuffle?pool=full` only — no polling, no listeners, no writes.
 */

import { hasShuffleEverHydrated, markShuffleHydrated } from "@/hooks/useShuffleReady";
import { normalizeShuffleProfiles } from "@/lib/shuffle/normalize";
import {
  readCachedShufflePool,
  readCachedShuffleStats,
  writeCachedShufflePool,
  writeCachedShuffleStats,
} from "@/lib/shuffle/shuffleClientCache";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";
import {
  fetchShuffleApi,
  shouldSuppressShuffleNetworkAtFireTime,
} from "@/lib/shuffle/shuffleSearchTypingGuard";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";

export type ShufflePoolWarmState = "ready" | "warming" | "empty" | "unknown";

const POOL_WARM_EVENT = "sayittome:shuffle-pool-warmed";
const MIN_READY_PROFILES = 3;

let inflight: Promise<ShufflePoolWarmState> | null = null;
let lastState: ShufflePoolWarmState = "unknown";

function emitWarmDiag(kind: string, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const ringKey = "__microSlideNoLoadingDiag";
    const win = window as unknown as Record<string, unknown>;
    const ring = Array.isArray(win[ringKey]) ? (win[ringKey] as unknown[]) : [];
    ring.push({
      kind,
      monoMs: Math.round(performance.timeOrigin + performance.now()),
      ...detail,
    });
    while (ring.length > 64) ring.shift();
    win[ringKey] = ring;
  } catch {
    /* ignore */
  }
}

/** True when a warm Chats→Shuffle hop must not issue /api/shuffle?pool=full. */
export function isShufflePoolWarmForNav(): boolean {
  const cached = readCachedShufflePool();
  if (cached && cached.length >= MIN_READY_PROFILES) return true;
  if (getVisibleShuffleProfiles().length >= MIN_READY_PROFILES) return true;
  // In-memory hydration already painted Shuffle; sessionStorage may lag/race.
  if (hasShuffleEverHydrated()) return true;
  return false;
}

export function getShufflePoolWarmState(): ShufflePoolWarmState {
  if (inflight) return "warming";
  if (isShufflePoolWarmForNav()) return "ready";
  const cached = readCachedShufflePool();
  if (cached && cached.length === 0) return "empty";
  if (lastState !== "unknown") return lastState;
  return cached == null ? "unknown" : "empty";
}

export function isShufflePoolWarmupInFlight() {
  return inflight !== null;
}

function applyWarmCacheToSlots(): boolean {
  const restored = restorePinnedShuffleWindowSync();
  const visible = getVisibleShuffleProfiles().length;
  if (visible > 0) {
    markShuffleHydrated(visible);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(POOL_WARM_EVENT, {
        detail: {
          profileCount: readCachedShufflePool()?.length ?? 0,
          visibleCount: visible,
        },
      }),
    );
  }
  return restored && visible >= MIN_READY_PROFILES;
}

/**
 * Ensure client pool cache is warm enough to paint Shuffle without loading shell.
 * Dedupes concurrent callers; respects existing TTL via readCachedShufflePool.
 */
export function ensureShufflePoolWarmForMicroSlide(): Promise<ShufflePoolWarmState> {
  if (typeof window === "undefined") {
    return Promise.resolve("unknown");
  }

  const cached = readCachedShufflePool();
  const visibleCount = getVisibleShuffleProfiles().length;
  // Warm-valid nav: never refetch when hydrated/visible/cache-ready (fixes
  // prod race where sessionStorage lag after cold load triggered pool=full).
  if (isShufflePoolWarmForNav()) {
    lastState = "ready";
    applyWarmCacheToSlots();
    emitWarmDiag("MICRO_SLIDE_FRESH_ANON_POOL_WARMUP_READY", {
      reason:
        cached && cached.length >= MIN_READY_PROFILES
          ? "cache-hit"
          : visibleCount >= MIN_READY_PROFILES
            ? "visible-hit"
            : "hydrated-hit",
      profileCount: cached?.length ?? 0,
      visibleCount,
      hydrated: hasShuffleEverHydrated(),
    });
    return Promise.resolve("ready");
  }

  if (inflight) {
    emitWarmDiag("MICRO_SLIDE_WAITING_FOR_SHUFFLE_READY", { reason: "warmup-inflight" });
    return inflight;
  }

  lastState = "warming";
  emitWarmDiag("MICRO_SLIDE_FRESH_ANON_POOL_WARMUP_STARTED", {
    reason: "cache-miss",
    cachedCount: cached?.length ?? 0,
    visibleCount,
    hydrated: hasShuffleEverHydrated(),
  });

  inflight = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      // Typing/focus fire-time gate — warmup must not land inside F6 windows.
      if (shouldSuppressShuffleNetworkAtFireTime()) {
        lastState = isShufflePoolWarmForNav() ? "ready" : "empty";
        return lastState;
      }
      const params = new URLSearchParams({ pool: "full", shuffle: "1" });
      const res = await fetchShuffleApi(`/api/shuffle?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json();
      const nextProfiles = normalizeShuffleProfiles(json?.profiles);
      if (nextProfiles.length > 0) {
        writeCachedShufflePool(nextProfiles);
        const profilesCreated = Number(json?.profilesCreated ?? 0);
        const anonymousOnline = Number(json?.anonymousOnline ?? 0);
        const total =
          json?.totalLive != null
            ? Number(json.totalLive)
            : profilesCreated + anonymousOnline || nextProfiles.length;
        writeCachedShuffleStats({
          profilesCreated,
          anonymousOnline,
          totalLive: total > 0 ? total : profilesCreated + anonymousOnline,
        });
        applyWarmCacheToSlots();
        lastState = nextProfiles.length >= MIN_READY_PROFILES ? "ready" : "empty";
        emitWarmDiag("MICRO_SLIDE_FRESH_ANON_POOL_WARMUP_READY", {
          reason: "fetch-ok",
          profileCount: nextProfiles.length,
        });
        return lastState;
      }

      lastState = "empty";
      emitWarmDiag("MICRO_SLIDE_DESTINATION_NOT_READY_NO_LOADING_CONTRACT_HELD", {
        reason: "pool-empty-after-fetch",
      });
      return "empty";
    } catch {
      const fallback = readCachedShufflePool();
      if (fallback && fallback.length >= MIN_READY_PROFILES) {
        applyWarmCacheToSlots();
        lastState = "ready";
        emitWarmDiag("MICRO_SLIDE_FRESH_ANON_POOL_WARMUP_READY", {
          reason: "fetch-failed-cache-fallback",
          profileCount: fallback.length,
        });
        return "ready";
      }
      lastState = "empty";
      emitWarmDiag("MICRO_SLIDE_NO_LOADING_CONTRACT_TIMEOUT", {
        reason: "warmup-fetch-failed",
      });
      return "empty";
    } finally {
      window.clearTimeout(timeout);
      inflight = null;
    }
  })();

  return inflight;
}

export function getShufflePoolWarmupStats() {
  const cached = readCachedShufflePool();
  const stats = readCachedShuffleStats();
  return {
    state: getShufflePoolWarmState(),
    inflight: isShufflePoolWarmupInFlight(),
    cachedCount: cached?.length ?? 0,
    visibleCount: typeof window !== "undefined" ? getVisibleShuffleProfiles().length : 0,
    totalLive: stats?.totalLive ?? 0,
  };
}

export const SHUFFLE_POOL_WARM_EVENT = POOL_WARM_EVENT;
