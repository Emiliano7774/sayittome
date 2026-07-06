"use client";

import Link from "next/link";

import HeaderControls from "@/components/HeaderControls";
import { useT } from "@/contexts/LocaleContext";
import { useUxMode } from "@/contexts/UxModeContext";

export default function ProfileEntryGate() {
  const { uxMode } = useUxMode();
  const t = useT();
  const isModern = uxMode === "modern";

  return (
    <main data-nav-settings-primary className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-lg px-5 py-8">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className={
                isModern
                  ? "text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300"
                  : "text-base font-medium text-zinc-100"
              }
            >
              {isModern ? "SAYITTOME" : "SayItToMe"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold">{t("profile_gate_title")}</h1>
          </div>
          <HeaderControls />
        </header>

        <section
          className={
            isModern
              ? "rounded-[2rem] border border-fuchsia-500/15 bg-zinc-950/80 p-6 shadow-[0_0_50px_rgba(168,85,247,0.12)]"
              : "rounded-[2rem] border border-white/10 bg-[#111] p-6"
          }
        >
          <p className="text-sm leading-7 text-zinc-400">{t("profile_gate_body")}</p>

          <p className="mt-4 text-sm leading-7 text-zinc-500">{t("profile_gate_note")}</p>

          <div className="mt-8 space-y-3">
            <Link
              href="/register"
              className={
                isModern
                  ? "flex h-14 items-center justify-center rounded-full bg-white text-sm font-normal text-black"
                  : "flex h-16 items-center justify-center rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] text-[15px] font-medium"
              }
            >
              {t("profile_gate_register")}
            </Link>

            <Link
              href="/login"
              className={
                isModern
                  ? "flex h-14 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-normal"
                  : "flex h-16 items-center justify-center rounded-full border border-white/15 text-[15px] font-medium"
              }
            >
              {t("profile_gate_login")}
            </Link>

            <Link
              href="/shuffle"
              className={
                isModern
                  ? "flex h-14 items-center justify-center text-sm text-zinc-500"
                  : "flex h-16 items-center justify-center text-[15px] text-zinc-500"
              }
            >
              {t("profile_gate_back_shuffle")}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
