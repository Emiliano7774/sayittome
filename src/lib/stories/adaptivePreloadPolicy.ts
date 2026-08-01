export type AdaptivePreloadTier = "aggressive" | "balanced" | "conservative";

export type AdaptivePreloadLimits = {
  tier: AdaptivePreloadTier;
  decodeAhead: number;
  fetchAhead: number;
  upcomingUserFirstMedia: number;
  videoSpeculative: boolean;
};

export function resolveAdaptivePreloadLimits(): AdaptivePreloadLimits {
  if (typeof navigator === "undefined") {
    return {
      tier: "balanced",
      decodeAhead: 1,
      fetchAhead: 1,
      upcomingUserFirstMedia: 1,
      videoSpeculative: false,
    };
  }

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;

  const saveData = connection?.saveData === true;
  const type = String(connection?.effectiveType || "").toLowerCase();

  if (saveData || type === "slow-2g" || type === "2g") {
    return {
      tier: "conservative",
      decodeAhead: 1,
      fetchAhead: 1,
      upcomingUserFirstMedia: 0,
      videoSpeculative: false,
    };
  }

  if (type === "3g") {
    return {
      tier: "balanced",
      decodeAhead: 1,
      fetchAhead: 1,
      upcomingUserFirstMedia: 1,
      videoSpeculative: false,
    };
  }

  // Even on fast networks, speculative video preload=auto was a major egress source.
  // Keep one image/video-metadata ahead; front buffer still uses auto for the active story.
  return {
    tier: "aggressive",
    decodeAhead: 1,
    fetchAhead: 1,
    upcomingUserFirstMedia: 1,
    videoSpeculative: false,
  };
}

let prefetchBytes = 0;
let consumedBytes = 0;

export function recordPrefetchBytes(bytes: number) {
  if (bytes > 0) prefetchBytes += bytes;
}

export function recordConsumedBytes(bytes: number) {
  if (bytes > 0) consumedBytes += bytes;
}

export function exportPrefetchStats() {
  const wasted = Math.max(0, prefetchBytes - consumedBytes);
  return {
    prefetchBytes,
    consumedBytes,
    wastedPrefetchBytes: wasted,
    wastedPrefetchRatio: prefetchBytes > 0 ? wasted / prefetchBytes : 0,
  };
}

export function resetPrefetchStats() {
  prefetchBytes = 0;
  consumedBytes = 0;
}
