"use client";

import { useEffect, useRef, useState } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  loadShuffleInlineNativeAd,
  SayittomeNativeAds,
  type InlineNativeAdContent,
} from "@/lib/monetization/sayittomeNativeAdsPlugin";
import { shuffleNativeInlineAdsSupported } from "@/lib/monetization/shuffleNativeAdsSupport";

export function useShuffleInlineNativeAd(slotId: string, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ad, setAd] = useState<InlineNativeAdContent | null>(null);
  const [loading, setLoading] = useState(enabled);
  const impressedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isNativeAppShell()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    impressedRef.current = false;

    void (async () => {
      setLoading(true);

      const supported = await shuffleNativeInlineAdsSupported();
      if (cancelled) return;

      if (!supported) {
        setAd(null);
        setLoading(false);
        return;
      }

      const result = await loadShuffleInlineNativeAd(slotId).catch(() => null);
      if (cancelled) return;

      if (result?.loaded && result.inline) {
        setAd(result);
      } else {
        setAd(null);
        void SayittomeNativeAds.destroyNativeAd({ slotId }).catch(() => undefined);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      setAd(null);
      void SayittomeNativeAds.destroyNativeAd({ slotId }).catch(() => undefined);
    };
  }, [enabled, slotId]);

  useEffect(() => {
    if (!enabled || !ad || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.45,
        );
        if (!visible || impressedRef.current) return;

        impressedRef.current = true;
        void SayittomeNativeAds.recordNativeAdImpression({ slotId }).catch(() => undefined);
      },
      { threshold: [0.45, 0.75] },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ad, enabled, slotId]);

  async function handleOpenAd() {
    await SayittomeNativeAds.performNativeAdClick({ slotId }).catch(() => undefined);
  }

  return { ref, ad, loading, handleOpenAd };
}
