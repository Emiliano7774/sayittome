"use client";

import ApkDownloadButton from "@/components/monetization/ApkDownloadButton";
import NewApkVersionBanner from "@/components/monetization/NewApkVersionBanner";
import NewUserWelcomeBanner from "@/components/monetization/NewUserWelcomeBanner";
import { useApkReleaseNotice } from "@/hooks/useApkReleaseNotice";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  variant?: "classic" | "modern";
};

export default function ApkDownloadSection({ variant = "classic" }: Props) {
  const t = useT();
  const isModern = variant === "modern";
  const { show: showUpdatePoster } = useApkReleaseNotice();

  if (isModern) {
    return (
      <div className="mt-10 space-y-4">
        {!showUpdatePoster ? <NewUserWelcomeBanner variant="modern" /> : null}

        <div className="rounded-[2rem] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_50px_rgba(168,85,247,0.12)]">
          <h2 className="text-2xl font-semibold">{t("apk_section_modern_title")}</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">{t("apk_section_modern_body")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ApkDownloadButton
              label={t("apk_android")}
              className="rounded-full bg-white px-6 py-3 text-sm font-normal text-black disabled:opacity-60"
            />
            <button
              type="button"
              disabled
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-normal text-white/35"
            >
              {t("apk_iphone_soon")}
            </button>
          </div>
        </div>

        {showUpdatePoster ? <NewApkVersionBanner variant="modern" /> : null}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {!showUpdatePoster ? <NewUserWelcomeBanner variant="classic" /> : null}

      <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6 shadow-[0_0_35px_rgba(255,255,255,0.025)]">
        <h2 className="text-2xl font-medium tracking-[-0.05em]">{t("apk_section_classic_title")}</h2>
        <p className="mt-3 text-sm font-normal leading-6 tracking-[-0.025em] text-zinc-400">
          {t("apk_section_classic_body")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <ApkDownloadButton
            label={t("apk_android")}
            className="flex h-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-normal tracking-[-0.03em] disabled:opacity-60"
          />
          <button
            type="button"
            disabled
            className="flex h-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-normal tracking-[-0.03em] text-white/35"
          >
            {t("apk_iphone_soon")}
          </button>
        </div>
      </div>

      {showUpdatePoster ? <NewApkVersionBanner variant="classic" /> : null}
    </div>
  );
}
