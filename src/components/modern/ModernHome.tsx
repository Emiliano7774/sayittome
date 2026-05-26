"use client";

import Link from "next/link";

import UxModeSwitcher from "@/components/UxModeSwitcher";
import ApkDownloadSection from "@/components/monetization/ApkDownloadSection";

export default function ModernHome() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300">
              SAYITTOME
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Anónimo. Rápido. Real.</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-fuchsia-500/30 px-5 py-3 text-sm font-normal"
            >
              Entrar
            </Link>
            <a
              href="/downloads/sayittome.apk"
              download
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-normal"
            >
              Descargar APK
            </a>
            <UxModeSwitcher />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-16 md:grid-cols-2">
          <div>
            <div className="mb-7 inline-flex rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-3 text-sm font-bold">
              Nueva SayItToMe web ultrarrápida en React/Next.js
            </div>

            <h2 className="max-w-xl text-6xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              Decilo sin filtro. Vivilo como red social.
            </h2>

            <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-300">
              Perfiles, historias, mensajes anónimos, chats en tiempo real y una experiencia
              oscura, misteriosa y mobile-first.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/register"
                className="rounded-full bg-white px-8 py-4 text-sm font-normal text-black"
              >
                Crear perfil
              </Link>

              <Link
                href="/shuffle"
                className="rounded-full bg-fuchsia-500/30 px-8 py-4 text-sm font-normal"
              >
                Ir al Shuffle
              </Link>

              <Link
                href="/shuffle"
                className="rounded-full bg-white/10 px-8 py-4 text-sm font-normal"
              >
                Entrar anónimo
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-8 rounded-[3rem] bg-fuchsia-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40">
              <div className="h-80 bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black" />
              <div className="-mt-16 px-6 pb-8">
                <div className="h-28 w-28 rounded-full border-4 border-black bg-gradient-to-br from-white to-zinc-500" />
                <h3 className="mt-5 text-3xl font-semibold">@sayittome</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Perfil oscuro premium, historias, chats y anónimos en la nueva web real.
                </p>
              </div>
            </div>
          </div>
        </div>

        <ApkDownloadSection variant="modern" />
      </section>
    </main>
  );
}
