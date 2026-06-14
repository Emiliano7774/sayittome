"use client";

import Link from "next/link";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  requestedUsername: string;
  currentUsername?: string;
  verifiedLink?: boolean;
};

export default function UsernameChangedNotice({
  requestedUsername,
  currentUsername,
  verifiedLink = false,
}: Props) {
  const t = useT();

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 pb-28 text-center text-white">
      <div className="max-w-xl">
        <p className="text-3xl font-black tracking-[-0.04em] text-white/90 md:text-4xl">
          {t("profile_username_changed_title")}
        </p>

        <p className="mt-4 text-base leading-relaxed text-white/55 md:text-lg">
          {verifiedLink
            ? t("profile_username_changed_verified_body", {
                username: requestedUsername,
              })
            : t("profile_username_changed_body", {
                username: requestedUsername,
              })}
        </p>

        {currentUsername ? (
          <p className="mt-3 text-sm font-semibold text-violet-300/90">
            {t("profile_username_changed_current", {
              username: currentUsername,
            })}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/shuffle"
            className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-bold text-white/85 transition hover:bg-white/[0.1]"
          >
            {t("profile_username_changed_back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
