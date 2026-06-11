"use client";

import { useEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { adsProvider } from "@/lib/monetization/ads";

/** Keeps the fixed bottom banner off shuffle routes when ads are enabled. */
export default function ShuffleAdsBootstrap() {
  useEffect(() => {
    if (!isNativeAppShell()) return;

    document.body.classList.add("sayittome-shuffle-route");
    void adsProvider.removeBanner();

    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, []);

  return null;
}
