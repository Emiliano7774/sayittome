"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";

import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useT } from "@/contexts/LocaleContext";
import { getClassicShuffleHeaderUi } from "@/lib/shuffle/classicHeaderUi";
import { classicFollowingSlotStyles } from "@/lib/shuffle/shuffleChromeStable";
import type { FollowingProfile } from "@/lib/shuffle/followingTypes";

type Props = {
  profiles: FollowingProfile[];
  loading?: boolean;
  hasSession: boolean;
  authPending?: boolean;
  showGuest?: boolean;
  state?: "guest" | "skeleton" | "rows" | "empty";
};

function FollowingSkeleton({
  count,
  ui,
}: {
  count: number;
  ui: ReturnType<typeof getClassicShuffleHeaderUi>;
}) {
  return (
    <div
      className="flex overflow-hidden"
      style={{ gap: ui.followingGapPx }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex shrink-0 flex-col items-center gap-1"
          style={{ width: ui.followingItemWPx }}
        >
          <div
            className="rounded-full bg-white/[0.06]"
            style={{
              width: ui.followingAvatarPx,
              height: ui.followingAvatarPx,
            }}
          />
          <span
            className="block rounded-full bg-white/[0.06]"
            style={{ height: ui.followingTextPx, width: ui.followingItemWPx * 0.72 }}
          />
        </div>
      ))}
    </div>
  );
}

export default function ClassicFollowingStrip({
  profiles,
  loading = false,
  hasSession,
  authPending = false,
  showGuest = false,
  state,
}: Props) {
  const t = useT();
  const { density } = useClassicShuffleDensity();
  const ui = getClassicShuffleHeaderUi(density);
  const resolvedState =
    state ||
    (authPending || loading
      ? profiles.length
        ? "rows"
        : "skeleton"
      : !hasSession || showGuest
        ? "guest"
        : profiles.length
          ? "rows"
          : "empty");

  const slotBox = classicFollowingSlotStyles(ui);
  const sectionStyle = {
    marginTop: slotBox.marginTop,
    paddingBottom: slotBox.paddingBottom,
    minHeight: slotBox.minHeight,
    height: slotBox.height,
    overflow: slotBox.overflow,
  };
  const labelStyle = { fontSize: ui.followingLabelPx };
  const textStyle = { fontSize: ui.followingTextPx };
  const btnStyle = {
    fontSize: ui.followingBtnTextPx,
    paddingInline: ui.followingBtnPadXPx,
    paddingBlock: ui.followingBtnPadYPx,
  };

  return (
    <div
      className="border-b border-white/10"
      style={sectionStyle}
      data-shuffle-following-slot="1"
      data-shuffle-following-state={resolvedState}
    >
      <p
        className="font-medium uppercase tracking-wide text-white/40"
        style={labelStyle}
      >
        {t("shuffle_following_title")}
      </p>

      <div
        className="mt-2 overflow-hidden"
        style={{ minHeight: ui.followingBodyPx }}
        data-shuffle-following-body="1"
      >
        {resolvedState === "guest" ? (
          <>
            <p className="leading-snug text-white/38" style={textStyle}>
              {t("shuffle_following_login")}
            </p>
            <div className="mt-2 flex flex-wrap" style={{ gap: ui.followingGapPx }}>
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
          </>
        ) : null}

        {resolvedState === "skeleton" ? (
          <FollowingSkeleton count={4} ui={ui} />
        ) : null}

        {resolvedState === "empty" ? (
          <p className="font-medium text-white/28" style={textStyle}>
            {t("shuffle_following_empty")}
          </p>
        ) : null}

        {resolvedState === "rows" ? (
          <div
            className="flex overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ gap: ui.followingGapPx }}
          >
            {profiles.map((profile) => (
              <Link
                key={profile.uid || profile.username}
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
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-black bg-green-500" />
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
        ) : null}
      </div>
    </div>
  );
}
