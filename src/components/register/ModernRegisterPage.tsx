"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";

import UxModeSwitcher from "@/components/UxModeSwitcher";
import { auth } from "@/lib/firebase";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { mapRegisterError } from "@/lib/auth/registerErrors";

export default function ModernRegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Escribí tu email.");
      return;
    }

    if (!password) {
      setError("Escribí una contraseña.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

      await sendEmailVerification(cred.user, {
        url: `${window.location.origin}/register/verify-email`,
        handleCodeInApp: false,
      });

      beginFreshAnonSession();

      router.replace("/register/verify-email");
    } catch (err: unknown) {
      const code = String((err as { code?: string })?.code || "");
      setError(mapRegisterError(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300">
              SAYITTOME
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Crear perfil</h1>
          </div>

          <UxModeSwitcher />
        </header>

        <div className="flex flex-1 items-center justify-center py-16">
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 p-8 shadow-2xl shadow-fuchsia-950/40"
          >
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-fuchsia-500/15 blur-3xl" />

            <p className="text-sm leading-7 text-zinc-400">
              Registrate con email y contraseña. Te enviaremos un mail para verificar tu cuenta
              antes de configurar tu perfil.
            </p>

            <div className="mt-8 space-y-4">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="Email"
                className="w-full rounded-2xl bg-white px-4 py-4 text-black outline-none"
              />

              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Contraseña"
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              />

              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Confirmar contraseña"
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              />
            </div>

            {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full rounded-full bg-white py-4 text-sm font-normal text-black disabled:opacity-50"
            >
              {loading ? "Creando cuenta..." : "Crear cuenta y verificar email"}
            </button>

            <p className="mt-6 text-center text-sm text-zinc-400">
              ¿Ya tenés cuenta?{" "}
              <Link href="/login" className="text-fuchsia-300">
                Iniciar sesión
              </Link>
            </p>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-4 w-full text-sm text-zinc-500"
            >
              Volver al inicio
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
