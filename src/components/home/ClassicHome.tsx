"use client";

import Link from "next/link";
import {
  EyeOff,
  LogIn,
  Moon,
  Share,
  Shuffle,
  Smartphone,
  UserPlus,
} from "lucide-react";

import UxModeSwitcher from "@/components/UxModeSwitcher";

/** Classic landing — layout vertical mobile (captura original). */
export default function ClassicHome() {
  return (
    <main className="min-h-screen bg-black px-5 py-6 pb-32 text-white">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Moon size={22} className="text-sky-300" strokeWidth={2.2} />
          <span className="text-2xl font-black tracking-tight">SayItToMe</span>
        </div>
        <UxModeSwitcher />
      </header>

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-gradient-to-br from-[#1a1028] via-[#0f0f12] to-black shadow-[0_0_50px_rgba(0,0,0,.45)]">
          <div className="h-52 bg-gradient-to-br from-violet-900/25 via-transparent to-black" />
          <div className="absolute bottom-5 left-5">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/15 bg-[#2a2a2e] shadow-xl">
              <UserPlus size={40} className="text-white/35" strokeWidth={1.6} />
            </div>
          </div>
        </div>

        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-3 rounded-[22px] bg-violet-600 px-6 py-4 text-lg font-black shadow-[0_0_35px_rgba(124,58,237,.28)] active:scale-[0.99] transition"
        >
          <LogIn size={22} strokeWidth={2.4} />
          Iniciar sesión
        </Link>

        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-3 rounded-[22px] border border-white/20 bg-black px-6 py-4 text-lg font-black active:scale-[0.99] transition"
        >
          <UserPlus size={22} strokeWidth={2.4} />
          Crear perfil
        </Link>

        <Link
          href="/shuffle"
          className="flex w-full items-center justify-center gap-3 rounded-[22px] border border-white/20 bg-black px-6 py-4 text-lg font-black active:scale-[0.99] transition"
        >
          <Shuffle size={22} strokeWidth={2.4} />
          Entrar anónimo
        </Link>

        <div className="rounded-[24px] border border-white/8 bg-[#111111]/90 p-5">
          <div className="flex items-start gap-3">
            <EyeOff size={26} className="mt-0.5 shrink-0 text-violet-400" strokeWidth={2.2} />
            <div>
              <p className="text-xl font-black">¿No querés registrarte?</p>
              <p className="mt-3 text-base font-bold leading-relaxed text-white/55">
                Tocá Entrar anónimo para escribirle a quien quieras sin crear perfil. Cada nuevo
                ingreso anónimo crea otra identidad.
              </p>
              <p className="mt-4 text-sm font-bold leading-relaxed text-white/40">
                Recordá: al refrescar, salir de anónimo o volver a entrar, se descarta el anon
                anterior y se abre una identidad nueva.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/8 bg-[#111111]/90 p-5">
          <p className="text-xl font-black">Descargá la app</p>
          <p className="mt-3 text-base font-bold leading-relaxed text-white/55">
            Mientras Play Store/App Store terminan su proceso, podés dejar accesos directos desde
            acá.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              href="/downloads/sayittome.apk"
              className="flex items-center justify-center gap-2 rounded-[18px] border border-white/15 bg-black px-4 py-3.5 text-sm font-black active:scale-[0.99] transition"
            >
              <Smartphone size={18} />
              Android APK
            </a>
            <a
              href="/downloads/sayittome.apk"
              className="flex items-center justify-center gap-2 rounded-[18px] border border-white/15 bg-black px-4 py-3.5 text-sm font-black active:scale-[0.99] transition"
            >
              <Share size={18} />
              iPhone
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
