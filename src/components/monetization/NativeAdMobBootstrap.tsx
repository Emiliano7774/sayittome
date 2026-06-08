"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  ADMOB_INTERSTITIAL_COOLDOWN_MS,
  initializeAdMob,
  prepareAdMobInterstitial,
  removeAdMobBanner,
  showAdMobBanner,
  showAdMobInterstitial,
  syncAdMobBannerPosition,
} from "@/lib/monetization/admobService";
import {
  shouldLoadAdMobInterstitials,
  shouldShowAdMobBanner,
} from "@/lib/monetization/adSurfaces";

export default function NativeAdMobBootstrap() {
  const pathname = usePathname();
  const lastInterstitialAtRef = useRef(0);
  const interstitialReadyRef = useRef(false);
  const showingInterstitialRef = useRef(false);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    let disposed = false;
    let interstitialTimer: number | null = null;
    let resumeListener: { remove: () => void } | null = null;

    const canShowBanner = () =>
      !disposed && shouldShowAdMobBanner(window.location.pathname);
    const canShowAds = () =>
      !disposed && shouldLoadAdMobInterstitials(window.location.pathname);

    const syncBanner = async () => {
      if (canShowBanner()) {
        await showAdMobBanner();
        return;
      }
      await removeAdMobBanner();
    };

    const prepareInterstitial = async () => {
      if (!canShowAds() || interstitialReadyRef.current || showingInterstitialRef.current) {
        return;
      }

      interstitialReadyRef.current = await prepareAdMobInterstitial();
    };

    const tryShowInterstitial = async () => {
      if (!canShowAds() || showingInterstitialRef.current) return;

      const now = Date.now();
      if (now - lastInterstitialAtRef.current < ADMOB_INTERSTITIAL_COOLDOWN_MS) return;

      if (!interstitialReadyRef.current) {
        await prepareInterstitial();
        if (!interstitialReadyRef.current) return;
      }

      showingInterstitialRef.current = true;

      try {
        const shown = await showAdMobInterstitial();
        if (shown) lastInterstitialAtRef.current = Date.now();
      } finally {
        showingInterstitialRef.current = false;
        interstitialReadyRef.current = false;
        void prepareInterstitial();
      }
    };

    const boot = async () => {
      const ready = await initializeAdMob();
      if (!ready || disposed) return;

      await syncBanner();

      if (canShowAds()) {
        await prepareInterstitial();
      }

      interstitialTimer = window.setInterval(() => {
        void tryShowInterstitial();
      }, ADMOB_INTERSTITIAL_COOLDOWN_MS);

      try {
        const { App } = await import("@capacitor/app");
        resumeListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          void syncBanner();
        });
      } catch {
        // Ignore when not running inside Capacitor.
      }
    };

    void boot();

    return () => {
      disposed = true;

      if (interstitialTimer) clearInterval(interstitialTimer);
      resumeListener?.remove();
      void removeAdMobBanner();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    void (async () => {
      if (shouldShowAdMobBanner(pathname)) {
        await showAdMobBanner();
        return;
      }

      await removeAdMobBanner();
    })();
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    const sync = () => {
      if (!shouldShowAdMobBanner(window.location.pathname)) return;
      void syncAdMobBannerPosition();
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return null;
}
