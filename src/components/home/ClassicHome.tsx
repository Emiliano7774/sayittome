"use client";

import Link from "next/link";

import UxModeSwitcher from "@/components/UxModeSwitcher";

/** Classic landing — congelada visualmente (Connected2.me). */
export default function ClassicHome() {
  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-black tracking-[0.2em] text-lime-400">SAYITTOME</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-full border border-white/20 px-5 py-3 text-sm font-black"
          >
            Entrar
          </Link>
          <a
            href="/downloads/sayittome.apk"
            className="rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white/70"
          >
            APK
          </a>
          <UxModeSwitcher />
        </div>
      </header>

      <section className="mx-auto max-w-4xl">
        <h1 className="text-[4.5rem] font-black leading-[0.9] tracking-[-0.08em] md:text-[6.5rem]">
          Decilo sin filtro.
        </h1>

        <p className="mt-8 max-w-2xl text-2xl font-bold leading-relaxed text-white/55 md:text-3xl">
          Perfiles, historias, chats anónimos y shuffle en tiempo real. La experiencia
          clásica Connected2.me en la web.
        </p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/login"
            className="rounded-full bg-lime-400 px-8 py-4 text-lg font-black text-black"
          >
            Crear perfil
          </Link>
          <Link
            href="/shuffle"
            className="rounded-full border-2 border-lime-400/60 bg-lime-400/10 px-8 py-4 text-lg font-black text-lime-300"
          >
            Ir al Shuffle
          </Link>
          <Link
            href="/shuffle"
            className="rounded-full border border-white/20 px-8 py-4 text-lg font-black"
          >
            Entrar anónimo
          </Link>
        </div>
      </section>
    </main>
  );
}
