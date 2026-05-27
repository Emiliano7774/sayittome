"use client";

import { useEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { removeAdMobBanner } from "@/lib/monetization/admobService";

/** Keeps the fixed AdMob banner off shuffle so it does not cover the toolbar. */
export default function ShuffleAdsBootstrap() {
  useEffect(() => {
    if (!isNativeAppShell()) return;

    document.body.classList.add("sayittome-shuffle-route");

    void removeAdMobBanner();
    const timer = window.setInterval(() => {
      void removeAdMobBanner();
    }, 1000);

    return () => {
      window.clearInterval(timer);
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, []);

  return null;
}
