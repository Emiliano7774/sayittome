"use client";

import PlayStoreButton from "@/components/monetization/PlayStoreButton";
import { useApkReleaseNotice } from "@/hooks/useApkReleaseNotice";
import { useShowWebOnlyPromo } from "@/hooks/useShowWebOnlyPromo";
import { formatApkReleaseRemaining } from "@/lib/app/release";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  variant?: "classic" | "modern";
  className?: string;
};

export default function NewApkVersionBanner({
  variant = "classic",
  className = "",
}: Props) {
  const t = useT();
  const showWebPromo = useShowWebOnlyPromo();
  const { show, release, remainingMs } = useApkReleaseNotice();

  if (!showWebPromo || !show || !release) return null;

  const isModern = variant === "modern";

  return (
    <div
      className={[
        isModern
          ? "relative overflow-hidden rounded-2xl border border-violet-500/35 bg-gradient-to-r from-violet-950/80 via-black to-fuchsia-950/60 p-4 shadow-[0_0_45px_rgba(124,58,237,0.28)]"
          : "relative overflow-hidden rounded-[1.4rem] border border-violet-400/30 bg-[#0a0a0a] p-4 shadow-[0_0_40px_rgba(105,82,255,0.22)]",
        className,
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute -inset-8 bg-violet-600/15 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className={
              isModern
                ? "text-xs font-semibold uppercase tracking-[0.35em] text-violet-300"
                : "text-xs font-black uppercase tracking-[0.35em] text-violet-300"
            }
          >
            {t("apk_new_version")}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {t("apk_new_version_body", { version: release.versionName })}
          </p>
          <p className="mt-2 font-mono text-xs tracking-wide text-violet-200/75">
            {t("apk_new_version_countdown", {
              time: formatApkReleaseRemaining(remainingMs),
            })}
          </p>
        </div>

        <PlayStoreButton
          label={t("apk_download")}
          className={
            isModern
              ? "rounded-full bg-white px-5 py-2.5 text-sm font-normal text-black transition active:scale-[0.98]"
              : "rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_30px_rgba(105,82,255,0.35)] transition active:scale-[0.98]"
          }
        />
      </div>
    </div>
  );
}
