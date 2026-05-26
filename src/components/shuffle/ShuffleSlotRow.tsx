"use client";

import { memo, useSyncExternalStore } from "react";

import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import {
  getShuffleSlotProfile,
  subscribeShuffleSlot,
} from "@/lib/shuffle/shuffleSlotsStore";
import { shuffleCount } from "@/lib/shuffle/shuffleProfiler";

function subscribeSlot(slot: number, onStoreChange: () => void) {
  return subscribeShuffleSlot(slot, onStoreChange);
}

function getSlotSnapshot(slot: number) {
  return getShuffleSlotProfile(slot);
}

function ShuffleSlotRow({ slot }: { slot: number }) {
  shuffleCount("rowRenders");

  const profile = useSyncExternalStore(
    (cb) => subscribeSlot(slot, cb),
    () => getSlotSnapshot(slot),
    () => getSlotSnapshot(slot),
  );

  if (!profile?.username) return null;

  const username = profile.username;
  const bio = profile.bio || "Sin descripcion.";

  return (
    <div className="w-full border-b border-white/10 contain-[layout_paint_style]">
      <div className="w-full py-7 flex items-center gap-7">
        <StoryAvatarButton
          ownerUid={profile.uid}
          username={username}
          photo={profile.photo}
          size="lg"
          mode="delegate"
          blurPhoto={profile.blurPhoto}
          showOnline={profile.showOnline}
        />

        <button
          type="button"
          data-action="chat"
          data-username={username}
          className="min-w-0 flex-1 text-left active:scale-[0.99] transition"
          aria-label={`Abrir chat con ${username}`}
        >
          <h2 className="truncate text-3xl font-black md:text-4xl">{username}</h2>
          <p className="mt-2 line-clamp-2 text-xl font-bold text-white/50 md:text-2xl">
            {bio}
          </p>
        </button>
      </div>
    </div>
  );
}

export default memo(ShuffleSlotRow);
