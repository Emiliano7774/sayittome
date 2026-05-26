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

export default function ClassicProfileSetup() {
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
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6 font-[Arial,Helvetica,sans-serif] tracking-[-0.015em]">
        <header className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-300 via-violet-500 to-[#4f35ff]" />
            <p className="text-base font-medium tracking-[-0.02em] text-zinc-100">Configurar perfil</p>
          </div>

          <UxModeSwitcher />
        </header>

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-[2.7rem] border border-violet-400/10 bg-[#030303] p-8 shadow-[0_0_80px_rgba(104,76,255,0.24)]"
        >
          <h1 className="text-3xl font-medium tracking-[-0.05em]">Tu perfil</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Elegí tu usuario y provincia. Después podés agregar fotos y más detalles.
          </p>

          <div className="mt-8 space-y-6">
            <label className="block">
              <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                Usuario
              </p>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@usuario"
                className="w-full bg-transparent border-b border-white/70 py-3 text-2xl outline-none text-white placeholder:text-white/35"
              />
            </label>

            <label className="block">
              <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                Bio
              </p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Contá algo sobre vos (opcional)"
                rows={3}
                className="w-full bg-transparent border-b border-white/70 py-3 text-lg outline-none text-white placeholder:text-white/35 resize-none"
              />
            </label>

            <ProvinceField
              provincia={provincia}
              mostrarProvincia={mostrarProvincia}
              onProvinciaChange={setProvincia}
              onMostrarProvinciaChange={setMostrarProvincia}
              variant="classic"
            />
          </div>

          {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-8 flex h-20 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] text-[15px] font-medium disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Continuar"}
          </button>
        </form>
      </section>
    </main>
  );
}
