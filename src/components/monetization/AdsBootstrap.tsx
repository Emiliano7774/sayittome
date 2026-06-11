"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  adsProvider,
  INTERSTITIAL_COOLDOWN_MS,
  shouldShowBanner,
  shouldShowInterstitial,
} from "@/lib/monetization/ads";

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

/**
 * Global ads lifecycle — currently no-ops because ADS_ENABLED = false.
 *
 * INSERTION POINTS wired here:
 * - Bottom banner on allowed routes
 * - Interstitial cooldown timer + prepare on boot
 * - Banner position sync on nav/layout changes
 */
export default function AdsBootstrap() {
  const pathname = usePathname();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!isNativeAppShell() || !adsProvider.enabled) return;

    let disposed = false;
    let interstitialTimer: number | null = null;
    let resumeListener: { remove: () => void } | null = null;
    let layoutTimer: number | null = null;

    const canShowBanner = () =>
      !disposed && shouldShowBanner(window.location.pathname);
    const canShowInterstitial = () =>
      !disposed && shouldShowInterstitial(window.location.pathname);

    const syncBanner = async () => {
      if (canShowBanner()) {
        await adsProvider.showBanner();
        adsProvider.scheduleBannerSync(250);
        return;
      }
      await adsProvider.removeBanner();
    };

    const boot = async () => {
      if (bootedRef.current) return;
      bootedRef.current = true;

      const ready = await adsProvider.initialize();
      if (!ready || disposed) return;

      layoutTimer = window.setTimeout(() => {
        if (disposed) return;
        void syncBanner();
      }, 600);

      if (canShowInterstitial()) {
        window.setTimeout(() => {
          if (!disposed) void adsProvider.prepareInterstitial();
        }, 1200);
      }

      interstitialTimer = window.setInterval(() => {
        void adsProvider.showInterstitial();
      }, INTERSTITIAL_COOLDOWN_MS);

      try {
        const { App } = await import("@capacitor/app");
        resumeListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          void syncBanner();
        });
      } catch {
        // Not running inside Capacitor.
      }
    };

    void boot();

    return () => {
      disposed = true;
      bootedRef.current = false;
      if (layoutTimer) window.clearTimeout(layoutTimer);
      if (interstitialTimer) clearInterval(interstitialTimer);
      resumeListener?.remove();
      void adsProvider.removeBanner();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppShell() || !adsProvider.enabled) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (shouldShowBanner(pathname)) {
          await adsProvider.showBanner();
          adsProvider.scheduleBannerSync(250);
          return;
        }
        await adsProvider.removeBanner();
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppShell() || !adsProvider.enabled) return;

    const observer = new MutationObserver((mutations) => {
      if (!shouldShowBanner(window.location.pathname)) return;
      if (!mutations.some(shouldSyncBannerForMutation)) return;
      adsProvider.scheduleBannerSync();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });

    const onViewportChange = () => adsProvider.scheduleBannerSync();
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

  useEffect(() => {
    if (!isNativeAppShell()) return;

    return () => {
      void adsProvider.destroyFeedAds();
    };
  }, [pathname]);

  return null;
}
