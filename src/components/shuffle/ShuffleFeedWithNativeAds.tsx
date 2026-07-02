"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import ShuffleAdSlot from "@/components/monetization/ShuffleAdSlot";
import {
  getShuffleAdSlotId,
  getShuffleFeedItemCount,
  getShuffleProfileIndex,
  isShuffleNativeAdIndex,
  shouldShowShuffleFeedAds,
} from "@/lib/shuffle/shuffleFeedAds";
import {
  getShuffleSlotsVersion,
  getShuffleWindowGeneration,
  getVisibleShuffleProfiles,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type Props = {
  /** Used for ad slot IDs so modern and classic never share the same ad instance. */
  mode: "modern" | "classic";
  variant: "grid" | "list";
  className?: string;
  renderProfile: (profile: ShuffleProfile, feedIndex: number) => ReactNode;
};

/** Feed ad insertion every N profiles — slots render when ADS_ENABLED is true. */
export default function ShuffleFeedWithNativeAds({
  mode,
  variant,
  className,
  renderProfile,
}: Props) {
  useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getShuffleSlotsVersion,
  );

  const windowGeneration = getShuffleWindowGeneration();
  const profiles = getVisibleShuffleProfiles();
  const showAds = shouldShowShuffleFeedAds(profiles.length);
  const itemCount = getShuffleFeedItemCount(profiles.length, showAds);

  return (
    <div
      key={windowGeneration}
      className={className}
      data-shuffle-list
      data-stm-no-polish
    >
      {Array.from({ length: itemCount }, (_, index) => {
        if (isShuffleNativeAdIndex(index, profiles.length, showAds)) {
          return (
            <ShuffleAdSlot
              key={getShuffleAdSlotId(mode, index)}
              slotId={getShuffleAdSlotId(mode, index)}
              variant={variant}
            />
          );
        }

        const profile = profiles[getShuffleProfileIndex(index)];
        if (!profile) return null;

        return renderProfile(profile, index);
      })}
      <div aria-hidden className="sayittome-nav-scroll-spacer" />
    </div>
  );
}
