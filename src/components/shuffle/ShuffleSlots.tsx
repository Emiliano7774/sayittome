"use client";

import { memo } from "react";

import ClassicShuffleProfileRow from "@/components/shuffle/ClassicShuffleProfileRow";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";

function ShuffleSlots() {
  return (
    <ShuffleFeedWithNativeAds
      mode="classic"
      variant="list"
      renderProfile={(profile, index) => (
        <ClassicShuffleProfileRow
          key={shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`}
          profile={profile}
        />
      )}
    />
  );
}

export default memo(ShuffleSlots);
