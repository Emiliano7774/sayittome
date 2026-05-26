import { writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

const content = `"use client";

import Link from "next/link";

import ModernIdentityCard from "@/components/modern/ModernIdentityCard";
import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function ModernHome() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-28 text-white">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 top-1/3 h-[32rem] w-[32rem] rounded-full bg-violet-600/18 blur-[160px]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 md:px-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[10px] font-black tracking-[0.35em] text-violet-400">SAYITTOME</p>
            <p className="mt-2 text-xl font-black tracking-tight md:text-2xl">
              Anónimo. Rápido. Real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/login"
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-[0_0_20px_rgba(124,58,237,.3)]"
            >
              Entrar
            </Link>
            <a
              href="/downloads/sayittome.apk"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-black text-white"
            >
              Descargar APK
            </a>
            <UxModeSwitcher />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 md:grid-cols-[1.75fr_0.9fr] md:gap-16 md:py-20">
          <div>
            <div className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-black text-violet-100">
              Nueva SayItToMe web ultrarrápida en React/Next.js
            </div>

            <h1 className="mt-7 max-w-xl text-5xl font-black leading-[0.95] tracking-tight md:text-6xl lg:text-[4.25rem]">
              Decilo sin filtro. Vivilo como red social.
            </h1>

            <p className="mt-6 max-w-xl text-base font-medium leading-7 text-white/55 md:text-lg">
              Perfiles, historias, mensajes anónimos, chats en tiempo real y una experiencia
              oscura, misteriosa y mobile-first.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-6 py-3 text-sm font-black text-black"
              >
                Crear perfil
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full bg-violet-600 px-6 py-3 text-sm font-black"
              >
                Ir al Shuffle
              </Link>
              <Link
                href="/shuffle"
                className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-black text-white"
              >
                Entrar anónimo
              </Link>
            </div>
          </div>

          <div className="w-full max-w-[300px] md:justify-self-end">
            <ModernIdentityCard
              variant="landing"
              username="sayittome"
              bio="Perfil oscuro premium, historias, chats y anónimos en la nueva web real."
              glow
            />
          </div>
        </div>
      </section>
    </main>
  );
}
`;

writeFileSync(join(root, "src/components/modern/ModernHome.tsx"), Buffer.from(content, "utf8"));
console.log("written ModernHome.tsx utf8", content.length);
