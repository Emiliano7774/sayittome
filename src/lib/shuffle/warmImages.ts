import type { ShuffleProfile } from "@/lib/shuffle/types";

export function warmShuffleImages(profiles: ShuffleProfile[], max = 80) {
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
      img.src = src;
    }
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 0);
  }
}
