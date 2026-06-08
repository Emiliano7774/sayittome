"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  ADMOB_INTERSTITIAL_COOLDOWN_MS,
  initializeAdMob,
  prepareAdMobInterstitial,
  removeAdMobBanner,
  scheduleAdMobBannerSync,
  showAdMobBanner,
  showAdMobInterstitial,
} from "@/lib/monetization/admobService";
import {
  shouldLoadAdMobInterstitials,
  shouldShowAdMobBanner,
} from "@/lib/monetization/adSurfaces";

const NAV_LAYOUT_CLASSES = [
  "sayittome-has-bottom-nav",
  "sayittome-story-viewer-open",
  "sayittome-chat-open",
  "sayittome-filters-open",
];

function shouldSyncBannerForMutation(mutation: MutationRecord) {
  if (mutation.type !== "attributes" || mutation.attributeName !== "class") {
    return false;
  }

  const before = String(mutation.oldValue || "");
  const after = document.body.className;

  return NAV_LAYOUT_CLASSES.some(
    (className) => before.includes(className) !== after.includes(className),
  );
}

export default function NativeAdMobBootstrap() {
  const pathname = usePathname();
  const lastInterstitialAtRef = useRef(0);
  const interstitialReadyRef = useRef(false);
  const showingInterstitialRef = useRef(false);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    let disposed = false;
    let interstitialTimer: number | null = null;
    let resumeListener: { remove: () => void } | null = null;
    let layoutTimer: number | null = null;

    const canShowBanner = () =>
      !disposed && shouldShowAdMobBanner(window.location.pathname);
    const canShowAds = () =>
      !disposed && shouldLoadAdMobInterstitials(window.location.pathname);

    const syncBanner = async () => {
      if (canShowBanner()) {
        await showAdMobBanner();
        scheduleAdMobBannerSync(250);
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
      if (bootedRef.current) return;
      bootedRef.current = true;

      const ready = await initializeAdMob();
      if (!ready || disposed) return;

      layoutTimer = window.setTimeout(() => {
        if (disposed) return;
        void syncBanner();
      }, 600);

      if (canShowAds()) {
        window.setTimeout(() => {
          if (!disposed) void prepareInterstitial();
        }, 1200);
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
      bootedRef.current = false;

      if (layoutTimer) window.clearTimeout(layoutTimer);
      if (interstitialTimer) clearInterval(interstitialTimer);
      resumeListener?.remove();
      void removeAdMobBanner();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (shouldShowAdMobBanner(pathname)) {
          await showAdMobBanner();
          scheduleAdMobBannerSync(250);
          return;
        }

        await removeAdMobBanner();
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppShell()) return;

    const observer = new MutationObserver((mutations) => {
      if (!shouldShowAdMobBanner(window.location.pathname)) return;
      if (!mutations.some(shouldSyncBannerForMutation)) return;
      scheduleAdMobBannerSync();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });

    const onViewportChange = () => scheduleAdMobBannerSync();
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  return null;
}
