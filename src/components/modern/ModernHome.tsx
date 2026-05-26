"use client";

import Link from "next/link";

import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function ModernHome() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-black pb-28 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(124,58,237,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-violet-600/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/12 blur-[150px]" />

      <section className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 animate-[fadeIn_.4s_ease-out]">
          <p className="text-[10px] font-black tracking-[0.35em] text-white/45">SAYITTOME</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-violet-400/35 bg-violet-500/10 px-4 py-2 text-sm font-black text-violet-100 shadow-[0_0_20px_rgba(124,58,237,.15)]"
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

        <div className="grid flex-1 items-center gap-10 py-8 md:grid-cols-2 md:gap-14 md:py-14">
          <div className="animate-[slideUp_.55s_ease-out]">
            <p className="text-sm font-black text-violet-200/80">Anónimo. Rápido. Real.</p>

            <div className="mt-5 inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-black text-violet-100 shadow-[0_0_30px_rgba(124,58,237,.25)]">
              Social app 2026 · misma base, nueva piel
            </div>

            <h1 className="mt-7 max-w-xl text-[2.75rem] font-black leading-[0.92] tracking-tight md:text-7xl">
              Decilo sin filtro. Vivilo como red social.
            </h1>

            <p className="mt-6 max-w-xl text-base font-bold leading-7 text-white/50 md:text-lg">
              Perfiles, historias, mensajes anónimos, chats en tiempo real y una experiencia
              oscura AMOLED, misteriosa y mobile-first.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-7 py-3.5 text-sm font-black text-black shadow-[0_0_40px_rgba(255,255,255,.18)] transition active:scale-95"
              >
                Crear perfil
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full bg-violet-600 px-7 py-3.5 text-sm font-black shadow-[0_0_48px_rgba(124,58,237,.4)] transition active:scale-95"
              >
                Ir al Shuffle
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-black backdrop-blur-sm transition active:scale-95"
              >
                Entrar anónimo
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm animate-[slideUp_.75s_ease-out]">
            <div className="absolute -inset-8 rounded-[2.75rem] bg-violet-500/25 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-violet-500/25 bg-[#050505] shadow-[0_0_100px_rgba(104,76,255,0.28)]">
              <div className="relative h-80 bg-gradient-to-br from-violet-600 via-[#1a0a2e] to-black md:h-[22rem]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_45%)]" />
              </div>
              <div className="-mt-16 px-6 pb-8">
                <div className="h-32 w-32 rounded-full border-4 border-black bg-gradient-to-br from-zinc-200 to-zinc-600 shadow-[0_0_40px_rgba(124,58,237,.35)]" />
                <p className="mt-5 text-2xl font-black">@sayittome</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white/45">
                  Perfil premium, historias, chats y anónimos — un solo cerebro, dos skins.
                </p>
                <div className="mt-5 flex gap-2">
                  <span className="rounded-full bg-violet-600/25 px-3 py-1 text-xs font-black text-violet-200">
                    Shuffle
                  </span>
                  <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-black text-white/55">
                    Historias
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
