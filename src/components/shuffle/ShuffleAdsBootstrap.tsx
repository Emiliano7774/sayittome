"use client";

import { useEffect } from "react";

import { useMainTabRouteActive } from "@/contexts/MainTabShellContext";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { adsProvider } from "@/lib/monetization/ads";

/** Keeps the fixed bottom banner off shuffle routes when ads are enabled. */
export default function ShuffleAdsBootstrap() {
  const shuffleActive = useMainTabRouteActive("/shuffle");

  useEffect(() => {
    if (!isNativeAppShell() || !shuffleActive) return;

    document.body.classList.add("sayittome-shuffle-route");
    void adsProvider.removeBanner();

    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, [shuffleActive]);

  return null;
}
