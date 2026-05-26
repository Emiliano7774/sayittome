"use client";

import { useSyncExternalStore } from "react";

import ModernShuffleCard from "@/components/modern/ModernShuffleCard";
import {
  getShuffleSlotsVersion,
  getVisibleShuffleProfiles,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";

export default function ModernShuffleGrid() {
  useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getShuffleSlotsVersion,
  );

  const profiles = getVisibleShuffleProfiles();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {profiles.map((profile) => (
        <ModernShuffleCard key={`${profile.uid}-${profile.username}`} profile={profile} />
      ))}
    </div>
  );
}
