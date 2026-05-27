"use client";

import { memo } from "react";

import ClassicShuffleProfileRow from "@/components/shuffle/ClassicShuffleProfileRow";
import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";

function ShuffleSlots() {
  return (
    <ShuffleFeedWithNativeAds
      mode="classic"
      variant="list"
      renderProfile={(profile, index) => (
        <ClassicShuffleProfileRow
          key={`${profile.uid}-${profile.username}-${index}`}
          profile={profile}
        />
      )}
    />
  );
}

export default memo(ShuffleSlots);
