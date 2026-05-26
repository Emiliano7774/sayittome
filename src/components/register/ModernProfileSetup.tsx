"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import ProvinceField from "@/components/register/ProvinceField";
import UxModeSwitcher from "@/components/UxModeSwitcher";
import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { auth, db } from "@/lib/firebase";
import {
  isUsernameAvailable,
  isValidUsername,
  normalizeUsername,
} from "@/lib/profile/username";

export default function ModernProfileSetup() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [mostrarProvincia, setMostrarProvincia] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/register");
        return;
      }

      if (!currentUser.emailVerified) {
        router.replace("/register/verify-email");
        return;
      }

      const next = await resolvePostAuthPath(currentUser.uid, true);
      if (next !== "/register/setup") {
        router.replace(next);
        return;
      }

      const snap = await getDoc(doc(db, "usuarios", currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setUsername(String(data.username || data.nombre || ""));
        setBio(String(data.bio || data.descripcion || ""));
        setProvincia(String(data.provincia || ""));
        setMostrarProvincia(data.mostrarProvincia === true);
      }

      setUser(currentUser);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError("");

    const cleanUsername = normalizeUsername(username);

    if (!isValidUsername(cleanUsername)) {
      setError("El usuario debe tener entre 3 y 24 caracteres (letras, números, . _ -).");
      return;
    }

    if (!provincia) {
      setError("Seleccioná tu provincia.");
      return;
    }

    const available = await isUsernameAvailable(cleanUsername, user.uid);
    if (!available) {
      setError("Ese nombre de usuario ya está en uso.");
      return;
    }

    setSaving(true);

    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        {
          uid: user.uid,
          email: user.email || "",
          username: cleanUsername,
          usernameLower: cleanUsername.toLowerCase(),
          nombre: cleanUsername,
          bio: bio.trim(),
          descripcion: bio.trim(),
          provincia,
          mostrarProvincia,
          profileSetupComplete: true,
          perfilCompleto: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      router.replace("/settings/edit");
    } catch {
      setError("No pudimos guardar tu perfil. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300">
              SAYITTOME
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Configurar perfil</h1>
          </div>

          <UxModeSwitcher />
        </header>

        <div className="flex flex-1 items-center justify-center py-16">
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 p-8 shadow-2xl shadow-fuchsia-950/40"
          >
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-fuchsia-500/15 blur-3xl" />

            <p className="text-sm leading-7 text-zinc-400">
              Elegí tu usuario y provincia. Después podés agregar fotos y más detalles en
              Editar perfil.
            </p>

            <div className="mt-8 space-y-5">
              <label className="block">
                <p className="mb-2 text-sm font-semibold text-zinc-400">Usuario</p>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@usuario"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-sm font-semibold text-zinc-400">Bio</p>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Contá algo sobre vos (opcional)"
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                />
              </label>

              <ProvinceField
                provincia={provincia}
                mostrarProvincia={mostrarProvincia}
                onProvinciaChange={setProvincia}
                onMostrarProvinciaChange={setMostrarProvincia}
                variant="modern"
              />
            </div>

            {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-8 w-full rounded-full bg-white py-4 text-sm font-normal text-black disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Continuar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
