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
      renderProfile={(profile, feedIndex) => {
        const identity =
          shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
        return <ClassicShuffleProfileRow key={identity} profile={profile} feedIndex={feedIndex} />;
      }}
    />
  );
}

export default memo(ShuffleSlots);
