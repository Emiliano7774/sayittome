"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { mapLoginError } from "@/lib/auth/registerErrors";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }

      const next = await resolvePostAuthPath(user.uid, user.emailVerified);
      router.replace(next);
    });

    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );

      beginFreshAnonSession();

      const next = await resolvePostAuthPath(
        cred.user.uid,
        cred.user.emailVerified,
      );
      router.replace(next);
    } catch (err: unknown) {
      const code = String((err as { code?: string })?.code || "");
      setError(mapLoginError(code));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black">Detectando sesión...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-[32px] border border-white/10 bg-zinc-950/80 p-8 shadow-[0_0_80px_rgba(139,92,246,.18)]"
      >
        <h1 className="text-3xl font-black mb-3">Iniciar sesión</h1>

        <p className="text-white/55 mb-8">
          Entrá con tu cuenta de SayItToMe.
        </p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder="Email"
          className="w-full h-14 rounded-2xl bg-white text-black px-4 mb-4 outline-none"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          className="w-full h-14 rounded-2xl bg-black border border-white/10 text-white px-4 mb-4 outline-none"
        />

        {error && (
          <p className="text-red-400 font-semibold mb-4">
            {error}
          </p>
        )}

        <button
          disabled={loading}
          className="w-full h-14 rounded-full bg-violet-500 font-black text-white disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-6 text-center text-sm text-white/55">
          ¿No tenés cuenta?{" "}
          <Link href="/register" className="text-violet-300">
            Crear perfil
          </Link>
        </p>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full mt-6 text-violet-300"
        >
          Volver
        </button>
      </form>
    </main>
  );
}
