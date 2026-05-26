"use client";

import { memo } from "react";
import Link from "next/link";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ModernShuffleCard({ profile }: { profile: ShuffleProfile }) {
  const story = useStoryStatus(profile.uid, profile.username);
  const href = story.hasActive && story.storyPath ? story.storyPath : `/u/${encodeURIComponent(profile.username)}`;
  const coverImage = profile.coverPhoto || profile.photo;

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-[28px] border border-violet-500/10 bg-[#0a0a0a] shadow-[0_0_50px_rgba(104,76,255,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_70px_rgba(104,76,255,0.22)] contain-[layout_paint_style]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {profile.coverVideo ? (
          <>
            <video
              src={profile.coverVideo}
              className={[
                "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
                profile.blurPhoto ? "blur-2xl scale-110" : "",
              ].join(" ")}
              autoPlay
              muted
              loop
              playsInline
            />
            {profile.blurPhoto ? (
              <SensitiveBlurOverlay label="Contenido moderado" />
            ) : null}
          </>
        ) : coverImage ? (
          <>
            <img
              src={coverImage}
              alt={profile.username}
              loading="lazy"
              decoding="async"
              className={[
                "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
                profile.blurPhoto ? "blur-2xl scale-110" : "",
              ].join(" ")}
            />
            {profile.blurPhoto ? (
              <SensitiveBlurOverlay label="Contenido moderado" />
            ) : null}
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-violet-700/35 via-[#12081f] to-black" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        {profile.showOnline ? (
          <span className="absolute right-3 top-3 rounded-full border border-green-400/30 bg-black/55 px-3 py-1 text-xs font-black text-green-300 backdrop-blur-sm">
            En línea
          </span>
        ) : null}

        {story.hasActive ? (
          <span
            className={[
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black backdrop-blur-sm",
              story.hasUnseen
                ? "bg-violet-500/30 text-violet-100"
                : "bg-zinc-700/50 text-zinc-300",
            ].join(" ")}
          >
            Historia
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="flex items-end gap-3">
          <div
            className={[
              "h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 bg-[#1a1a1a]",
              story.hasUnseen
                ? "border-violet-400"
                : story.hasActive
                  ? "border-zinc-600"
                  : "border-white/10",
            ].join(" ")}
          >
            {profile.photo ? (
              <img src={profile.photo} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-[0.2em] text-violet-300/80">
              SAYITTOME
            </p>
            <p className="truncate text-xl font-black">@{profile.username}</p>
            <p className="line-clamp-1 text-sm font-bold text-white/55">
              {profile.bio || "Perfil SayItToMe"}
            </p>
          </div>

          {profile.showOnline ? (
            <span className="mb-1 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,.8)]" />
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default memo(ModernShuffleCard, (a, b) => a.profile.uid === b.profile.uid && a.profile.username === b.profile.username);
