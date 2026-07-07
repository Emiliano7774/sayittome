"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { areFeedAdsEnabled } from "@/lib/monetization/ads";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

/** Native APK → AdMob when ADS_ENABLED (unchanged / off). Web shuffle Monetag inline removed. */
export default function ShuffleAdSlot({ slotId, variant }: Props) {
  void slotId;
  void variant;

  if (isNativeAppShell()) {
    if (!areFeedAdsEnabled()) return null;
    // Native feed ads stay behind ADS_ENABLED; not wired in this change.
    return null;
  }

  return null;
}
