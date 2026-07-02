"use client";

import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import ModernShuffleCard from "@/components/modern/ModernShuffleCard";
import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";

export default function ModernShuffleGrid() {
  return (
    <ShuffleFeedWithNativeAds
      mode="modern"
      variant="grid"
      className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3"
      renderProfile={(profile) => {
        const identity =
          shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
        return <ModernShuffleCard key={identity} profile={profile} />;
      }}
    />
  );
}
