"use client";

import NewApkVersionBanner from "@/components/monetization/NewApkVersionBanner";

type Props = {
  variant?: "classic" | "modern";
};

export default function ApkDownloadSection({ variant = "classic" }: Props) {
  const isModern = variant === "modern";

  if (isModern) {
    return (
      <div className="mt-10 space-y-4">
        <NewApkVersionBanner variant="modern" />

        <div className="rounded-[2rem] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_50px_rgba(168,85,247,0.12)]">
          <h2 className="text-2xl font-semibold">Descargá la app Android</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            APK oficial con AdMob integrado, shuffle fluido y experiencia AMOLED premium.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/downloads/sayittome.apk"
              download
              className="rounded-full bg-white px-6 py-3 text-sm font-normal text-black"
            >
              Android APK
            </a>
            <button
              type="button"
              disabled
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-normal text-white/35"
            >
              iPhone (pronto)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <NewApkVersionBanner variant="classic" />

      <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6 shadow-[0_0_35px_rgba(255,255,255,0.025)]">
        <h2 className="text-2xl font-medium tracking-[-0.05em]">Descargá la app</h2>
        <p className="mt-3 text-sm font-normal leading-6 tracking-[-0.025em] text-zinc-400">
          Mientras Play Store/App Store terminan su proceso, podés dejar accesos directos desde
          acá.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href="/downloads/sayittome.apk"
            download
            className="flex h-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-normal tracking-[-0.03em]"
          >
            Android APK
          </a>
          <button
            type="button"
            disabled
            className="flex h-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-normal tracking-[-0.03em] text-white/35"
          >
            iPhone
          </button>
        </div>
      </div>
    </div>
  );
}
