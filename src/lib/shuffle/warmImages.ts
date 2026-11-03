import { profileThumbnailUrl } from "@/lib/media/profileThumbnail";
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
    const limit = Math.max(0, Math.min(max, 16));

    // Limit by selected slot position, not by the number of new URLs. Repeated
    // renders must not progressively prefetch the entire 35-card pool.
    for (const [index, profile] of profiles.slice(0, limit).entries()) {
      // Warm the same safe small avatar format used by the visible cards.
      // Never speculatively download a full Storage original (some are 1–28 MB).
      // Unrecognized/private media is loaded only by its actual visible image.
      const src = profileThumbnailUrl(profile.photo, 256);
      if (!src || seen.has(src) || warmedUrls.has(src)) continue;
      seen.add(src);
      if (warmedUrls.size < MAX_WARMED_SESSION) {
        warmedUrls.add(src);
      }
      const img = new Image();
      img.decoding = "async";
      // Warm the first visible avatars ahead of speculative/offscreen photos.
      // Beyond the first screen, low priority prevents these requests from
      // competing with the tapped profile, chat messages or visible stories.
      img.fetchPriority = index < 4 ? "high" : "low";
      img.onerror = () => {
        // A failed photo must not remain marked warm for the whole session.
        warmedUrls.delete(src);
      };
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
