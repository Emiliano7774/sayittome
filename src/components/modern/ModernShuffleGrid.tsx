"use client";

import { useSyncExternalStore } from "react";

import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import ModernShuffleCard from "@/components/modern/ModernShuffleCard";
import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";
import {
  getShuffleSlotsVersion,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";

export default function ModernShuffleGrid() {
  const slotsVersion = useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getShuffleSlotsVersion,
  );

  return (
    <ShuffleFeedWithNativeAds
      mode="modern"
      variant="grid"
      className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3"
      renderProfile={(profile, index) => {
        const identity =
          shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
        return (
          <ModernShuffleCard
            key={`${identity}-${slotsVersion}-${index}`}
            profile={profile}
          />
        );
      }}
    />
  );
}
