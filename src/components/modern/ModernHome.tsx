"use client";

import Link from "next/link";

import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function ModernHome() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-28 text-white">
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-600/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-96 w-96 rounded-full bg-fuchsia-600/15 blur-[140px]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[10px] font-black tracking-[0.35em] text-white/45">SAYITTOME</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-violet-400/35 px-4 py-2 text-sm font-black text-violet-100"
            >
              Entrar
            </Link>
            <a
              href="/downloads/sayittome.apk"
              className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-black text-white/75"
            >
              Descargar APK
            </a>
            <UxModeSwitcher />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2 md:gap-14 md:py-16">
          <div className="animate-[fadeIn_.5s_ease-out]">
            <p className="text-sm font-black text-white/70">Anónimo. Rápido. Real.</p>

            <div className="mt-5 inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-black text-violet-100 shadow-[0_0_30px_rgba(124,58,237,.2)]">
              Nueva SayItToMe web ultrarrápida en React/Next.js
            </div>

            <h1 className="mt-7 max-w-xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Decilo sin filtro. Vivilo como red social.
            </h1>

            <p className="mt-6 max-w-xl text-base font-bold leading-7 text-white/50 md:text-lg">
              Perfiles, historias, mensajes anónimos, chats en tiempo real y una experiencia
              oscura, misteriosa y mobile-first.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-7 py-3.5 text-sm font-black text-black shadow-[0_0_40px_rgba(255,255,255,.15)] active:scale-95 transition"
              >
                Crear perfil
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full bg-violet-600 px-7 py-3.5 text-sm font-black shadow-[0_0_40px_rgba(124,58,237,.35)] active:scale-95 transition"
              >
                Ir al Shuffle
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-black active:scale-95 transition"
              >
                Entrar anónimo
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm animate-[fadeIn_.7s_ease-out]">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-violet-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-violet-500/20 bg-[#0a0a0a] shadow-[0_0_90px_rgba(104,76,255,0.22)]">
              <div className="h-72 bg-gradient-to-br from-violet-600/80 via-[#1a0a2e] to-black md:h-80" />
              <div className="-mt-14 px-6 pb-7">
                <div className="h-28 w-28 rounded-full border-4 border-black bg-gradient-to-br from-white to-zinc-500 shadow-2xl" />
                <p className="mt-5 text-2xl font-black">@sayittome</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white/45">
                  Perfil oscuro premium, historias, chats y anónimos en la nueva web real.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
