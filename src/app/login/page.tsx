"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("emilianomaturano@gmail.com");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setChecking(false);

      if (user) {
        router.replace("/settings");
      }
    });

    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      router.replace("/settings");
    } catch (err: any) {
      console.error("LOGIN_ERROR", err);

      const code = String(err?.code || "");

      if (code.includes("invalid-credential")) {
        setError("Email o contraseña incorrectos.");
      } else if (code.includes("user-not-found")) {
        setError("No existe una cuenta con ese email.");
      } else if (code.includes("wrong-password")) {
        setError("Contraseña incorrecta.");
      } else if (code.includes("too-many-requests")) {
        setError("Demasiados intentos. Esperá unos minutos.");
      } else {
        setError(`No se pudo iniciar sesión: ${code || "error desconocido"}`);
      }
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
