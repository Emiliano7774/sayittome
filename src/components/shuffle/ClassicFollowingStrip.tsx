"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";
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

  if (!hasSession) {
    return (
      <div className="mt-4 border-b border-white/10 pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/28">
          {t("shuffle_following_title")}
        </p>

        <p className="mt-2 text-sm leading-6 text-white/38">{t("shuffle_following_login")}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-full border border-white/12 px-4 py-2 text-xs font-black text-white/80"
          >
            {t("shuffle_following_login_btn")}
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black text-white"
          >
            {t("shuffle_following_register_btn")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-4 border-b border-white/10 pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/28">
          {t("shuffle_following_title")}
        </p>
        <p className="mt-2 text-xs font-bold text-white/22">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-b border-white/10 pb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/28">
        {t("shuffle_following_title")}
      </p>

      {profiles.length === 0 ? (
        <p className="mt-2 text-xs font-bold text-white/28">{t("shuffle_following_empty")}</p>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {profiles.map((profile) => (
            <Link
              key={profile.uid}
              href={`/u/${encodeURIComponent(profile.username)}`}
              className="flex w-[64px] shrink-0 flex-col items-center gap-1.5 active:scale-[0.98]"
            >
              <div className="relative h-[48px] w-[48px] overflow-hidden rounded-full bg-[#141414]">
                {profile.photo ? (
                  <img
                    src={profile.photo}
                    alt={profile.username}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/30">
                    <UserRound size={20} strokeWidth={1.75} />
                  </div>
                )}

                {profile.showOnline ? (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-black bg-green-500" />
                ) : null}
              </div>

              <span className="max-w-[64px] truncate text-[10px] font-bold text-white/55">
                {profile.username}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
