"use client";

import { useEffect, useRef, useState } from "react";

import {
  mountMonetagShuffleInlineAd,
  unmountMonetagShuffleInlineAd,
} from "@/lib/monetization/monetagShuffleInline";
import { logMonetag } from "@/lib/monetization/monetagDev";

export function useMonetagShuffleInlineAd(slotId: string, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setMounted(false);
      return;
    }

    const node = ref.current;
    if (!node) return;

    let cancelled = false;
    let didMount = false;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35,
        );
        if (!visible || cancelled || didMount) return;

        didMount = true;
        mountMonetagShuffleInlineAd(node, slotId);
        logMonetag("shuffle-inline-visible", { slotId });
        setMounted(true);
      },
      { threshold: [0.35, 0.65] },
    );

    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      node.innerHTML = "";
      unmountMonetagShuffleInlineAd(slotId);
      setMounted(false);
    };
  }, [enabled, slotId]);

  return { ref, mounted };
}
