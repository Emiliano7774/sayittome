"use client";

import { memo, useSyncExternalStore } from "react";

import ClassicShuffleProfileRow from "@/components/shuffle/ClassicShuffleProfileRow";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";
import {
  getShuffleSlotsVersion,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";

function ShuffleSlots() {
  const slotsVersion = useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getShuffleSlotsVersion,
  );

  return (
    <ShuffleFeedWithNativeAds
      mode="classic"
      variant="list"
      renderProfile={(profile, index) => {
        const identity =
          shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
        return (
          <ClassicShuffleProfileRow
            key={`${identity}-${slotsVersion}-${index}`}
            profile={profile}
          />
        );
      }}
    />
  );
}

export default memo(ShuffleSlots);
