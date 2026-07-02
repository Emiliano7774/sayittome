"use client";

import { memo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import AdminProfileRoleplayButton from "@/components/profile/AdminProfileRoleplayButton";
import AdminProfileBlurPhotosButton from "@/components/profile/AdminProfileBlurPhotosButton";
import ShuffleModeratedIndicator from "@/components/shuffle/ShuffleModeratedIndicator";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { stashProfileReturnTo } from "@/lib/navigation/profileReturnNav";
import { prefetchPublicProfile } from "@/lib/profile/profileCache";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ModernShuffleCard({ profile }: { profile: ShuffleProfile }) {
  const router = useRouter();
  const prefetchStartedRef = useRef(false);
  const story = useStoryStatus(profile.uid, profile.username);
  const opensStory =
    story.hasActive && story.hasUnseen && Boolean(story.storyPath);
  const href =
    opensStory && story.storyPath
      ? story.storyPath
      : `/u/${encodeURIComponent(profile.username)}`;

  const subtext = profile.bio?.trim() || "Perfil SayItToMe";

  useEffect(() => {
    prefetchStartedRef.current = false;
  }, [profile.username]);

  function handleLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    stashProfileReturnTo("/shuffle");
    fastRouterPush(router, href);
  }

  function handlePointerEnter() {
    if (opensStory || prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    prefetchPublicProfile(profile.username);
  }

  return (
    <div className="relative block w-full">
      <div
        className={[
          "pointer-events-auto absolute right-3 z-30 flex shrink-0 flex-col gap-1.5",
          profile.showOnline ? "top-14" : "top-3",
        ].join(" ")}
      >
        <AdminProfileRoleplayButton
          profile={profile}
          variant="modern"
          appearance="shuffle"
        />
        <AdminProfileBlurPhotosButton
          profile={profile}
          variant="modern"
          appearance="shuffle"
        />
      </div>
      <Link
        href={href}
        onClick={handleLinkClick}
        onPointerEnter={handlePointerEnter}
        className="relative block w-full"
      >
      <div className="absolute -inset-4 rounded-[2rem] bg-fuchsia-500/20 blur-2xl" />
      <div className="group relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40 contain-[layout_paint_style]">
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          {profile.photo ? (
            <>
              <img
                src={profile.photo}
                alt={profile.username}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className={[
                  "absolute inset-0 h-full w-full object-cover",
                  profile.blurPhoto ? "scale-110 blur-2xl" : "",
                ].join(" ")}
              />
              {profile.blurPhoto ? (
                <SensitiveBlurOverlay label="Contenido moderado" mediaKey={profile.photo} />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-700/35 via-[#12081f] to-black" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
          <ShuffleModeratedIndicator profile={profile} variant="modern" />

          {profile.shuffleFeatured ? (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-orange-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-orange-300 backdrop-blur-sm">
              ★ Destacado
            </span>
          ) : null}

          {profile.showOnline ? (
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-green-400/30 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-green-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              En línea
            </span>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex items-end gap-3">
              <div className="relative shrink-0">
                <div
                  className={[
                    "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-[3px] border-black bg-gradient-to-br from-white to-zinc-500 sm:h-16 sm:w-16",
                    story.hasUnseen
                      ? "ring-2 ring-fuchsia-400"
                      : story.hasActive
                        ? "ring-2 ring-zinc-600"
                        : "",
                  ].join(" ")}
                >
                  {profile.photo ? (
                    <img
                      src={profile.photo}
                      alt=""
                      loading="eager"
                      decoding="async"
                      className={[
                        "h-full w-full object-cover",
                        profile.blurPhoto ? "scale-110 blur-2xl" : "",
                      ].join(" ")}
                    />
                  ) : (
                    <UserRound size={28} className="text-black/45" strokeWidth={1.75} />
                  )}
                </div>
                {profile.showOnline ? (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black bg-green-500 shadow-[0_0_10px_rgba(34,197,94,.85)]" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold sm:text-xl">@{profile.username}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-white/55 sm:text-sm sm:leading-6">
                  {subtext}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
    </div>
  );
}

export default memo(
  ModernShuffleCard,
  (a, b) =>
    a.profile.uid === b.profile.uid &&
    a.profile.username === b.profile.username &&
    a.profile.photo === b.profile.photo &&
    a.profile.showOnline === b.profile.showOnline &&
    a.profile.shuffleFeatured === b.profile.shuffleFeatured &&
    a.profile.moderationTag === b.profile.moderationTag &&
    a.profile.blurPhoto === b.profile.blurPhoto,
);
