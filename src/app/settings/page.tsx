"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Heart, MessageCircle, Users, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type MediaItem = {
  url: string;
  type: "image" | "video";
};

function formatDate(value: any) {
  const date = value?.toDate?.();
  if (!date) return "";

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "usuarios", user.uid));
      setProfile(snap.exists() ? { uid: user.uid, ...snap.data() } : { uid: user.uid });
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const username = profile?.username || profile?.nombre || "Sin username";
  const bio = profile?.bio || profile?.descripcion || "Escribí algo...";
  const createdAtLabel = formatDate(profile?.createdAt);

  const media = useMemo<MediaItem[]>(() => {
    const fotos = Array.isArray(profile?.fotos)
      ? profile.fotos.map((url: string) => ({ url, type: "image" as const }))
      : [];

    const videos = Array.isArray(profile?.videos)
      ? profile.videos.map((url: string) => ({ url, type: "video" as const }))
      : [];

    const merged = [...fotos, ...videos];

    if (merged.length === 0 && profile?.fotoPrincipal) {
      merged.push({ url: profile.fotoPrincipal, type: "image" });
    }

    return merged;
  }, [profile]);

  const portada = profile?.fotoPrincipal || media.find((m) => m.type === "image")?.url || "";
  const selected = selectedIndex === null ? null : media[selectedIndex] || null;

  function openCover() {
    if (!media.length) return;
    const index = Math.max(0, media.findIndex((m) => m.url === portada));
    setSelectedIndex(index);
  }

  function previousMedia() {
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev <= 0 ? media.length - 1 : prev - 1;
    });
  }

  function nextMedia() {
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev >= media.length - 1 ? 0 : prev + 1;
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-3xl font-black">Cargando perfil...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pb-28">
      <section className="relative min-h-screen overflow-hidden px-6 sm:px-10 lg:px-16 py-10">
        {portada && (
          <button type="button" onClick={openCover} className="absolute inset-0 w-full h-full">
            <img src={portada} alt={username} className="w-full h-full object-cover opacity-45 blur-[1px]" />
          </button>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/78 to-black/35 pointer-events-none" />

        <div className="relative z-10 max-w-[1500px] mx-auto">
          <div className="flex justify-end">
            <button
              onClick={() => router.push("/settings/edit")}
              className="rounded-full bg-white text-black px-9 py-4 font-black shadow-[0_0_30px_rgba(255,255,255,.18)]"
            >
              Editar perfil
            </button>
          </div>

          <div className="mt-24">
            <h1 className="text-7xl sm:text-8xl font-black leading-none">{username}</h1></div>

<div className="grid grid-cols-2 md:grid-cols-4 gap-10 mt-20">
            {profile?.mostrarLikes !== false && (
              <div className="text-center">
                <div className="mx-auto w-36 h-36 rounded-full bg-pink-500 flex items-center justify-center shadow-[0_0_45px_rgba(236,72,153,.45)]">
                  <Heart size={58} fill="white" />
                </div>
                <p className="mt-5 text-5xl font-black">{profile?.likesCount || 0}</p>
                <p className="text-white/70 text-2xl">me gusta</p>
              </div>
            )}

            {profile?.mostrarConversaciones !== false && (
              <div className="text-center">
                <div className="mx-auto w-36 h-36 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_45px_rgba(34,197,94,.45)]">
                  <MessageCircle size={58} fill="white" />
                </div>
                <p className="mt-5 text-5xl font-black">{profile?.conversacionesCount || 0}</p>
                <p className="text-white/70 text-2xl">conv.</p>
              </div>
            )}

            {profile?.mostrarSeguidores !== false && (
              <div className="text-center">
                <div className="mx-auto w-36 h-36 rounded-full bg-violet-500 flex items-center justify-center shadow-[0_0_45px_rgba(139,92,246,.45)]">
                  <Users size={58} />
                </div>
                <p className="mt-5 text-5xl font-black">{profile?.seguidoresCount || 0}</p>
                <p className="text-white/70 text-2xl">seguidores</p>
              </div>
            )}

            <div className="text-center">
              <div className="mx-auto w-36 h-36 rounded-full bg-sky-400 flex items-center justify-center shadow-[0_0_45px_rgba(56,189,248,.45)]">
                <BookOpen size={58} />
              </div>
              <p className="mt-5 text-5xl font-black">{profile?.historiasCount || 0}</p>
              <p className="text-white/70 text-2xl">historias</p>
            </div>
        <div className="mt-32 flex flex-col lg:flex-row lg:justify-between gap-10 items-end">
          <div className="max-w-4xl">
            <p className="text-2xl sm:text-3xl text-white/82 leading-snug pt-4">
              {bio}
            </p>

            {profile?.mostrarProvincia !== false && profile?.provincia && (
              <p className="mt-8 text-white/38 text-xl font-bold">
                {profile.provincia}
              </p>
            )}
          </div></div>

          </div>
        </div>
      </section>

      {createdAtLabel && (
        <div className="fixed bottom-28 right-10 z-20 text-white/25 italic text-lg text-right pointer-events-none">
          Perfil creado el {createdAtLabel}
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelectedIndex(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-5"
        >
          {media.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  previousMedia();
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
              >
                <ChevronLeft size={34} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextMedia();
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
              >
                <ChevronRight size={34} />
              </button>
            </>
          )}

          <button
            onClick={() => setSelectedIndex(null)}
            className="absolute top-6 right-6 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={30} />
          </button>

          {selected.type === "image" ? (
            <img
              src={selected.url}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-[24px]"
            />
          ) : (
            <video
              src={selected.url}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-[24px]"
              controls
              autoPlay
            />
          )}
        </div>
      )}
    </main>
  );
}




