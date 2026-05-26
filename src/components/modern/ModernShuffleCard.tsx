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

  const subtext = profile.bio?.trim() || "Perfil SayItToMe";

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-[22px] border border-violet-500/8 bg-[#0a0a0a] shadow-[0_0_40px_rgba(104,76,255,0.1)] contain-[layout_paint_style]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-b from-violet-700/55 via-[#12081f] to-black" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />

        {profile.showOnline ? (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-black text-white backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,.9)]" />
            En línea
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 pb-5">
        <div className="flex items-end gap-3">
          <div className="relative shrink-0">
            <div
              className={[
                "h-14 w-14 overflow-hidden rounded-full border-2 bg-[#1a1a1a]",
                story.hasUnseen
                  ? "border-violet-400"
                  : story.hasActive
                    ? "border-zinc-500"
                    : "border-white/15",
              ].join(" ")}
            >
              {profile.photo ? (
                <img src={profile.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-zinc-600 to-zinc-900" />
              )}
            </div>
            {profile.showOnline ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black bg-green-500 shadow-[0_0_10px_rgba(34,197,94,.85)]" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 pb-0.5">
            <p className="text-[10px] font-black tracking-[0.22em] text-white/55">SAYITTOME</p>
            <p className="truncate text-[1.35rem] font-black leading-tight">
              @{profile.username}
            </p>
            <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-bold text-white/55">
              {profile.showOnline ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
              ) : null}
              <span className="truncate">{subtext}</span>
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
