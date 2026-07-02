import type { ShuffleProfile } from "@/lib/shuffle/types";

type WarmOptions = {
  /** Prefetch immediately instead of waiting for idle time. */
  urgent?: boolean;
};

export function warmShuffleImages(
  profiles: ShuffleProfile[],
  max = 80,
  options?: WarmOptions,
) {
  if (typeof window === "undefined") return;

  const run = () => {
    const seen = new Set<string>();
    let warmed = 0;

    for (const profile of profiles) {
      if (warmed >= max) break;
      const src = profile.photo;
      if (!src || seen.has(src)) continue;
      seen.add(src);
      warmed += 1;
      const img = new Image();
      img.decoding = "async";
      if (warmed <= 12) {
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
