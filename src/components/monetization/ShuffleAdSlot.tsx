"use client";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import MonetagShuffleSlot from "@/components/monetization/MonetagShuffleSlot";
import NativeAdShuffleSlot from "@/components/monetization/NativeAdShuffleSlot";

type Props = {
  slotId: string;
  variant: "grid" | "list";
};

/** APK → AdMob native. Web browser → Monetag inline. Same slot every 5 profiles. */
export default function ShuffleAdSlot({ slotId, variant }: Props) {
  if (isNativeAppShell()) {
    return <NativeAdShuffleSlot slotId={slotId} variant={variant} />;
  }

  return <MonetagShuffleSlot slotId={slotId} variant={variant} />;
}
