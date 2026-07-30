"use client";

import Link from "next/link";

import HeaderControls from "@/components/HeaderControls";
import EnterShuffleButton from "@/components/legal/EnterShuffleButton";
import ApkDownloadSection from "@/components/monetization/ApkDownloadSection";
import PublicLegalFooter from "@/components/legal/PublicLegalFooter";
import { useT } from "@/contexts/LocaleContext";

function LoginIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 8V5.8C14 4.8 13.2 4 12.2 4H5.8C4.8 4 4 4.8 4 5.8v12.4c0 1 .8 1.8 1.8 1.8h6.4c1 0 1.8-.8 1.8-1.8V16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 12h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m16 8 4 4-4 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 11a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z" fill="currentColor" />
      <path d="M2.7 19.4c.7-3.3 3.2-5.3 6.8-5.3 3.5 0 6.1 2 6.8 5.3.15.7-.4 1.3-1.1 1.3H3.8c-.7 0-1.25-.6-1.1-1.3Z" fill="currentColor" />
      <path d="M18 6v6M15 9h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h2.2c2.8 0 4.1 10 7 10H20" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M17 14l3 3-3 3" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17h2.2c1.2 0 2.1-1.8 3-3.9" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M13.2 7H20" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M17 4l3 3-3 3" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnonymousIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.6 12s2.8-5 8.4-5 8.4 5 8.4 5-2.8 5-8.4 5-8.4-5-8.4-5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" fill="currentColor" />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ClassicProfileGlyph() {
  return (
    <svg width="78" height="78" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="33" r="15" fill="url(#platinumUser)" />
      <path d="M22 76c3.2-15.8 13.1-24.2 26-24.2S70.8 60.2 74 76c.45 2.2-1.25 4.2-3.5 4.2h-45c-2.25 0-3.95-2-3.5-4.2Z" fill="url(#platinumUser)" />
      <defs>
        <linearGradient id="platinumUser" x1="20" y1="18" x2="78" y2="84">
          <stop stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#e8e8ef" />
          <stop offset="1" stopColor="#b8bbc8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ClassicHome() {
  const t = useT();

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6 font-[Arial,Helvetica,sans-serif] tracking-[-0.015em] md:max-w-6xl md:px-6 md:py-8">
        <header className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-300 via-violet-500 to-[#4f35ff]" />
            <p className="text-base font-medium tracking-[-0.02em] text-zinc-100">SayItToMe</p>
          </div>

          <HeaderControls />
        </header>

        <div className="grid flex-1 items-center gap-8 md:grid-cols-2 md:gap-12 md:py-12">
          <div className="order-2 md:order-1">
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
              <a
                href="/login"
                className="flex h-20 flex-1 items-center justify-center gap-4 rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] text-[15px] font-medium tracking-[-0.02em] shadow-[0_0_45px_rgba(105,82,255,0.48)] md:h-auto md:min-h-[3.5rem] md:px-8 md:py-4"
              >
                <LoginIcon />
                {t("home_classic_login")}
              </a>

              <Link
                href="/register"
                className="flex h-20 flex-1 items-center justify-center gap-4 rounded-full border border-white/80 bg-black text-[15px] font-medium tracking-[-0.02em] text-zinc-100 md:h-auto md:min-h-[3.5rem] md:px-8 md:py-4"
              >
                <UserPlusIcon />
                {t("home_classic_register")}
              </Link>

              <EnterShuffleButton className="flex h-20 w-full flex-1 items-center justify-center gap-4 rounded-full border border-white/80 bg-black text-[15px] font-medium tracking-[-0.02em] text-zinc-100 md:h-auto md:min-h-[3.5rem] md:w-auto md:px-8 md:py-4">
                <ShuffleIcon />
                {t("home_classic_anon")}
              </EnterShuffleButton>
            </div>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-[#111] p-6 shadow-[0_0_35px_rgba(255,255,255,0.025)]">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-violet-400/40 bg-violet-600/20 text-violet-300">
                  <AnonymousIcon />
                </div>

                <div>
                  <h2 className="text-2xl font-medium tracking-[-0.05em]">{t("home_classic_anon_title")}</h2>
                  <p className="mt-2 text-sm font-normal leading-6 tracking-[-0.025em] text-zinc-400">
                    {t("home_classic_anon_body")}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-normal leading-5 tracking-[-0.025em] text-zinc-400">
                {t("home_classic_anon_note")}
              </div>
            </div>
          </div>

          <div className="order-1 md:order-2">
            <div className="overflow-hidden rounded-[2.7rem] border border-violet-400/10 bg-[#030303] shadow-[0_0_80px_rgba(104,76,255,0.24)]">
              <div className="flex h-[430px] items-end bg-[radial-gradient(circle_at_50%_0%,rgba(105,82,255,0.22),transparent_45%),linear-gradient(to_bottom,#18162e_0%,#101019_38%,#030303_100%)] p-8 md:h-[480px]">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#1a1a1a] shadow-[inset_0_0_18px_rgba(255,255,255,0.03)]">
                  <ClassicProfileGlyph />
                </div>
              </div>
            </div>
          </div>
        </div>

        <ApkDownloadSection variant="classic" />
        <PublicLegalFooter className="mt-8" />
      </section>
    </main>
  );
}
