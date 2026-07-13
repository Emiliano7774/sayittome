"use client";

import HeaderControls from "@/components/HeaderControls";
import EnterShuffleButton from "@/components/legal/EnterShuffleButton";
import NativeAwareLink from "@/components/navigation/NativeAwareLink";
import ApkDownloadSection from "@/components/monetization/ApkDownloadSection";
import PublicLegalFooter from "@/components/legal/PublicLegalFooter";
import { useT } from "@/contexts/LocaleContext";

export default function ModernHome() {
  const t = useT();

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300">
              SAYITTOME
            </p>
            <h1 className="mt-3 text-3xl font-semibold">{t("home_tagline")}</h1>
          </div>

          <HeaderControls />
        </header>

        <div className="grid flex-1 items-center gap-12 py-16 md:grid-cols-2">
          <div>
            <div className="mb-7 inline-flex rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-3 text-sm font-bold">
              {t("home_modern_badge")}
            </div>

            <h2 className="max-w-xl text-6xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              {t("home_modern_headline")}
            </h2>

            <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-300">
              {t("home_modern_body")}
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <NativeAwareLink
                href="/register"
                className="rounded-full bg-white px-8 py-4 text-sm font-normal text-black"
              >
                {t("home_create_profile")}
              </NativeAwareLink>

              <EnterShuffleButton
                label={t("home_go_shuffle")}
                className="rounded-full bg-fuchsia-500/30 px-8 py-4 text-sm font-normal"
              />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-8 rounded-[3rem] bg-fuchsia-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40">
              <div className="h-80 bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black" />
              <div className="-mt-16 px-6 pb-8">
                <div className="h-28 w-28 rounded-full border-4 border-black bg-gradient-to-br from-white to-zinc-500" />
                <h3 className="mt-5 text-3xl font-semibold">@sayittome</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{t("home_card_bio")}</p>
              </div>
            </div>
          </div>
        </div>

        <ApkDownloadSection variant="modern" />
        <PublicLegalFooter className="mt-10" />
      </section>
    </main>
  );
}
