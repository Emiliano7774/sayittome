"use client";

import { memo } from "react";
import Link from "next/link";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ModernShuffleCard({ profile }: { profile: ShuffleProfile }) {
  const story = useStoryStatus(profile.uid, profile.username);
  const href =
    story.hasActive && story.storyPath
      ? story.storyPath
      : `/u/${encodeURIComponent(profile.username)}`;

  return (
    <Link href={href} className="relative block w-full">
      <div className="absolute -inset-4 rounded-[2rem] bg-fuchsia-500/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40">
        <div className="relative h-44 sm:h-48">
          {profile.photo ? (
            <>
              <img
                src={profile.photo}
                alt={profile.username}
                loading="lazy"
                decoding="async"
                className={[
                  "absolute inset-0 h-full w-full object-cover",
                  profile.blurPhoto ? "blur-2xl scale-110" : "",
                ].join(" ")}
              />
              {profile.blurPhoto ? (
                <SensitiveBlurOverlay label="Contenido moderado" />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black" />
          )}

          {profile.showOnline ? (
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-green-400/30 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-green-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              En línea
            </span>
          ) : null}
        </div>

        <div className="relative bg-zinc-950 px-4 pb-5 sm:px-5 sm:pb-6">
          <div className="absolute left-4 top-0 z-10 -translate-y-1/2 sm:left-5">
            <div
              className={[
                "h-16 w-16 overflow-hidden rounded-full border-4 border-black bg-gradient-to-br from-white to-zinc-500 sm:h-20 sm:w-20",
                story.hasUnseen
                  ? "ring-2 ring-fuchsia-400"
                  : story.hasActive
                    ? "ring-2 ring-zinc-600"
                    : "",
              ].join(" ")}
            >
              {profile.photo ? (
                <img src={profile.photo} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>

          <div className="pt-10 sm:pt-11">
            <h3 className="truncate text-lg font-semibold sm:text-xl">
              @{profile.username}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400 sm:mt-2 sm:text-sm sm:leading-6">
              {profile.bio?.trim() || "Perfil SayItToMe"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default memo(
  ModernShuffleCard,
  (a, b) =>
    a.profile.uid === b.profile.uid && a.profile.username === b.profile.username,
);
