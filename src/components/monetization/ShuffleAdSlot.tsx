"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { areFeedAdsEnabled } from "@/lib/monetization/ads";
import MonetagShuffleSlot from "@/components/monetization/MonetagShuffleSlot";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

/** Web browser → Monetag inline. Native APK → AdMob when ADS_ENABLED (unchanged / off). */
export default function ShuffleAdSlot({ slotId, variant }: Props) {
  if (isNativeAppShell()) {
    if (!areFeedAdsEnabled()) return null;
    // Native feed ads stay behind ADS_ENABLED; not wired in this change.
    return null;
  }

  return <MonetagShuffleSlot slotId={slotId} variant={variant} />;
}
