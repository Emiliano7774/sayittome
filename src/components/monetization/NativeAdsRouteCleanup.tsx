"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { SayittomeNativeAds } from "@/lib/monetization/sayittomeNativeAdsPlugin";
import { useUxMode } from "@/contexts/UxModeContext";

export default function NativeAdsRouteCleanup() {
  const pathname = usePathname();
  const { uxMode } = useUxMode();

  useEffect(() => {
    if (!isNativeAppShell()) return;

    return () => {
      void SayittomeNativeAds.destroyAllNativeAds().catch(() => undefined);
    };
  }, [pathname, uxMode]);

  return null;
}
