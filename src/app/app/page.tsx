"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { logoutAndResetAnon } from "@/lib/auth/logout";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type UserProfile = {
  username?: string;
  usernameLower?: string;
  bio?: string;
  fotoPrincipal?: string;
  photoURL?: string;
  email?: string;
};

export default function AppPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = "/login";
        return;
      }

      setUser(currentUser);

      const ref = doc(db, "usuarios", currentUser.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(
          ref,
          {
            uid: currentUser.uid,
            email: currentUser.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            origenWebNext: true,
          },
          { merge: true }
        );
      }

      const freshSnap = await getDoc(ref);
      setProfile((freshSnap.data() ?? {}) as UserProfile);
      setLoading(false);
    });
  }, []);

  async function logout() {
    await logoutAndResetAnon();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm font-bold text-fuchsia-300">Cargando SayItToMe...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <section className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-fuchsia-300">
            â† SayItToMe
          </Link>

          <button
            onClick={logout}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
          >
            Cerrar sesiÃ³n
          </button>
        </header>

        <div className="mt-10 grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
          <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950">
            <div className="h-56 bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black" />

            <div className="-mt-14 px-6 pb-6">
              <div
                className="h-28 w-28 rounded-full border-4 border-black bg-cover bg-center shadow-xl"
                style={{
                  backgroundImage: profile?.fotoPrincipal
                    ? `url(${profile.fotoPrincipal})`
                    : profile?.photoURL
                      ? `url(${profile.photoURL})`
                      : "linear-gradient(135deg, white, #71717a)",
                }}
              />

              <h1 className="mt-4 text-3xl font-black">
                @{profile?.username || user?.email?.split("@")[0] || "usuario"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {profile?.bio || "Tu perfil SayItToMe ya estÃ¡ conectado a la nueva web React."}
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-3xl bg-black/70 p-3 text-center">
                <div>
                  <p className="text-lg font-black">0</p>
                  <p className="text-[11px] text-zinc-500">Likes</p>
                </div>
                <div>
                  <p className="text-lg font-black">0</p>
                  <p className="text-[11px] text-zinc-500">Chats</p>
                </div>
                <div>
                  <p className="text-lg font-black">0</p>
                  <p className="text-[11px] text-zinc-500">Seguidores</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.45em] text-fuchsia-300">
              Panel web
            </p>

            <h2 className="mt-3 text-4xl font-black">Primera conexiÃ³n real lista.</h2>

            <p className="mt-4 text-sm leading-7 text-zinc-400">
              Esta pantalla ya usa Firebase Auth y Firestore reales. Desde acÃ¡ vamos a
              reconstruir perfiles, shuffle, historias, chats y admin sin cambiar la estÃ©tica.
            </p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                âœ… Usuario autenticado: {user?.email}
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                âœ… Documento conectado: usuarios/{user?.uid}
              </div>
              <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-4">
                PrÃ³ximo mÃ³dulo: perfil pÃºblico real.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
