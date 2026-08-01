import type { ShuffleProfile } from "@/lib/shuffle/types";

type WarmOptions = {
  /** Prefetch immediately instead of waiting for idle time. */
  urgent?: boolean;
};

const warmedUrls = new Set<string>();
const MAX_WARMED_SESSION = 120;

export function clearShuffleImageWarmCache() {
  warmedUrls.clear();
}

export function warmShuffleImages(
  profiles: ShuffleProfile[],
  max = 12,
  options?: WarmOptions,
) {
  if (typeof window === "undefined") return;

  const run = () => {
    const seen = new Set<string>();
    let warmed = 0;
    const limit = Math.max(0, Math.min(max, 16));

    for (const profile of profiles) {
      if (warmed >= limit) break;
      const src = profile.photo;
      if (!src || seen.has(src) || warmedUrls.has(src)) continue;
      seen.add(src);
      warmed += 1;
      if (warmedUrls.size < MAX_WARMED_SESSION) {
        warmedUrls.add(src);
      }
      const img = new Image();
      img.decoding = "async";
      if (warmed <= 4) {
        img.fetchPriority = "high";
      }
      img.src = src;
    }
  };

  if (options?.urgent) {
    run();
    return;
  }

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 400 });
  } else {
    setTimeout(run, 0);
  }
}
