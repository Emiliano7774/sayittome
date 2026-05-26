"use client";

import { memo, useSyncExternalStore } from "react";
import { UserRound } from "lucide-react";

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
        <button
          type="button"
          data-action="profile"
          data-username={username}
          className="relative shrink-0 active:scale-95 transition"
          aria-label={`Abrir perfil de ${username}`}
        >
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[#242424] flex items-center justify-center">
            {profile.photo ? (
              <img
                src={profile.photo}
                alt={username}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className={[
                  "h-full w-full object-cover",
                  profile.blurPhoto ? "blur-2xl scale-110" : "",
                ].join(" ")}
              />
            ) : (
              <UserRound size={64} className="text-white/75" />
            )}
          </div>

          {profile.showOnline ? (
            <div className="absolute bottom-1 right-1 h-6 w-6 rounded-full border-[3px] border-black bg-green-500" />
          ) : null}
        </button>

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
