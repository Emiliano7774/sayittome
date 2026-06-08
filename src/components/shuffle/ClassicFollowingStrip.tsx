"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";

import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useT } from "@/contexts/LocaleContext";
import { getClassicShuffleHeaderUi } from "@/lib/shuffle/classicHeaderUi";
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
  const ui = getClassicShuffleHeaderUi(density);

  const sectionStyle = {
    marginTop: ui.followingMtPx,
    paddingBottom: ui.followingPbPx,
  };
  const labelStyle = { fontSize: ui.followingLabelPx };
  const textStyle = { fontSize: ui.followingTextPx };
  const btnStyle = {
    fontSize: ui.followingBtnTextPx,
    paddingInline: ui.followingBtnPadXPx,
    paddingBlock: ui.followingBtnPadYPx,
  };

  if (!hasSession) {
    return (
      <div className="border-b border-white/10" style={sectionStyle}>
        <p
          className="font-medium uppercase tracking-wide text-white/40"
          style={labelStyle}
        >
          {t("shuffle_following_title")}
        </p>

        <p className="mt-1.5 leading-snug text-white/38" style={textStyle}>
          {t("shuffle_following_login")}
        </p>

        <div
          className="mt-2 flex flex-wrap"
          style={{ gap: ui.followingGapPx }}
        >
          <Link
            href="/login"
            className="rounded-full border border-white/12 font-medium text-white/80"
            style={btnStyle}
          >
            {t("shuffle_following_login_btn")}
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-violet-600 font-medium text-white"
            style={btnStyle}
          >
            {t("shuffle_following_register_btn")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border-b border-white/10" style={sectionStyle}>
        <p
          className="font-medium uppercase tracking-wide text-white/40"
          style={labelStyle}
        >
          {t("shuffle_following_title")}
        </p>
        <p className="mt-1.5 font-medium text-white/22" style={textStyle}>
          {t("common_loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-white/10" style={sectionStyle}>
      <p
        className="font-medium uppercase tracking-wide text-white/40"
        style={labelStyle}
      >
        {t("shuffle_following_title")}
      </p>

      {profiles.length === 0 ? (
        <p className="mt-1.5 font-medium text-white/28" style={textStyle}>
          {t("shuffle_following_empty")}
        </p>
      ) : (
        <div
          className="mt-2 flex overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ gap: ui.followingGapPx }}
        >
          {profiles.map((profile) => (
            <Link
              key={profile.uid}
              href={`/u/${encodeURIComponent(profile.username)}`}
              className="flex shrink-0 flex-col items-center gap-1 active:scale-[0.98]"
              style={{ width: ui.followingItemWPx }}
            >
              <div
                className="relative overflow-hidden rounded-full bg-[#141414]"
                style={{
                  width: ui.followingAvatarPx,
                  height: ui.followingAvatarPx,
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
                    <UserRound
                      size={Math.max(12, ui.followingAvatarPx * 0.42)}
                      strokeWidth={1.75}
                    />
                  </div>
                )}

                {profile.showOnline ? (
                  <span
                    className="absolute bottom-0 right-0 rounded-full border-black bg-green-500"
                    style={{
                      width: ui.onlineDotPx,
                      height: ui.onlineDotPx,
                      borderWidth: Math.max(1, Math.round(ui.onlineDotPx * 0.22)),
                      borderStyle: "solid",
                    }}
                  />
                ) : null}
              </div>

              <span
                className="truncate font-medium text-white/75"
                style={{ ...textStyle, maxWidth: ui.followingItemWPx }}
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
