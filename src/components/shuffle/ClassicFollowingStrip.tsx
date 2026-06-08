"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";

import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useT } from "@/contexts/LocaleContext";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";
import type { FollowingProfile } from "@/hooks/useFollowingProfiles";

type Props = {
  profiles: FollowingProfile[];
  loading?: boolean;
  hasSession: boolean;
};

export default function ClassicFollowingStrip({
  profiles,
  loading = false,
  hasSession,
}: Props) {
  const t = useT();
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);

  const labelClass = `${tokens.followingLabel} font-semibold uppercase text-white/40`;
  const sectionClass = `${tokens.followingMt} border-b border-white/10 ${tokens.followingPb}`;
  const guestBtnClass = `${tokens.followingBtnPx} ${tokens.followingBtnPy} rounded-full font-medium ${tokens.followingBtnText}`;

  if (!hasSession) {
    return (
      <div className={sectionClass}>
        <p className={labelClass}>{t("shuffle_following_title")}</p>

        <p className={`mt-1.5 leading-snug text-white/38 ${tokens.followingGuestText}`}>
          {t("shuffle_following_login")}
        </p>

        <div className={`mt-2 flex flex-wrap ${tokens.followingGap}`}>
          <Link
            href="/login"
            className={`border border-white/12 text-white/80 ${guestBtnClass}`}
          >
            {t("shuffle_following_login_btn")}
          </Link>
          <Link
            href="/register"
            className={`bg-violet-600 text-white ${guestBtnClass}`}
          >
            {t("shuffle_following_register_btn")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={sectionClass}>
        <p className={labelClass}>{t("shuffle_following_title")}</p>
        <p className={`mt-1.5 font-medium text-white/22 ${tokens.followingGuestText}`}>
          {t("common_loading")}
        </p>
      </div>
    );
  }

  return (
    <div className={sectionClass}>
      <p className={labelClass}>{t("shuffle_following_title")}</p>

      {profiles.length === 0 ? (
        <p className={`mt-1.5 font-medium text-white/28 ${tokens.followingGuestText}`}>
          {t("shuffle_following_empty")}
        </p>
      ) : (
        <div
          className={`mt-2 flex overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${tokens.followingGap}`}
        >
          {profiles.map((profile) => (
            <Link
              key={profile.uid}
              href={`/u/${encodeURIComponent(profile.username)}`}
              className="flex shrink-0 flex-col items-center gap-1 active:scale-[0.98]"
              style={{ width: tokens.followingItemW }}
            >
              <div
                className="relative overflow-hidden rounded-full bg-[#141414]"
                style={{
                  width: tokens.followingAvatar,
                  height: tokens.followingAvatar,
                }}
              >
                {profile.photo ? (
                  <img
                    src={profile.photo}
                    alt={profile.username}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/30">
                    <UserRound size={Math.max(12, tokens.followingAvatar * 0.42)} strokeWidth={1.75} />
                  </div>
                )}

                {profile.showOnline ? (
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-black bg-green-500" />
                ) : null}
              </div>

              <span
                className={`truncate font-medium text-white/75 ${tokens.followingName}`}
                style={{ maxWidth: tokens.followingItemW }}
              >
                {profile.username}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
