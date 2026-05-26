"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Users,
  Copy,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { formatLastSeen } from "@/lib/presence";

type Profile = {
  uid: string;
  email: string;
  username: string;
  bio: string;
  provincia: string;
  mostrarProvincia: boolean;
  fotoPrincipal: string;
  fotos?: string[];
  likes: number;
  conversaciones: number;
  seguidores: number;
  historias?: number;
  stories?: number;
  createdAtLabel: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
};

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();

  const usernameParam =
    typeof params?.username === "string" ? params.username : "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
      setCurrentEmail(user?.email || "");
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const res = await fetch(
          `/api/profile/${encodeURIComponent(usernameParam)}?ts=${Date.now()}`,
          { cache: "no-store" }
        );

        const json = await res.json();
        setProfile(json?.profile || null);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    if (usernameParam) load();
  }, [usernameParam]);

  const isOwner = useMemo(() => {
    if (!profile) return false;

    return (
      (!!currentUid && currentUid === profile.uid) ||
      (!!currentEmail && currentEmail === profile.email)
    );
  }, [profile, currentUid, currentEmail]);

  const gallery = useMemo(() => {
    if (!profile) return [];

    const all = [
      profile.fotoPrincipal,
      ...(Array.isArray(profile.fotos) ? profile.fotos : []),
    ]
      .filter(Boolean)
      .map((item) => String(item));

    return Array.from(new Set(all));
  }, [profile]);

  const historiasCount = Number(profile?.historias || profile?.stories || 0);
  const lastSeenLabel = profile
    ? formatLastSeen(profile.presenceAt || profile.lastActive, profile.online)
    : "";

  async function copyLink() {
    const link = `${window.location.origin}/u/${encodeURIComponent(
      profile?.username || usernameParam
    )}`;

    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function openViewer(index = 0) {
    if (gallery.length === 0) return;
    setViewerIndex(index);
    setViewerOpen(true);
  }

  function closeViewer() {
    setViewerOpen(false);
  }

  function prevPhoto() {
    if (gallery.length === 0) return;
    setViewerIndex((v) => (v - 1 + gallery.length) % gallery.length);
  }

  function nextPhoto() {
    if (gallery.length === 0) return;
    setViewerIndex((v) => (v + 1) % gallery.length);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!viewerOpen) return;

      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") prevPhoto();
      if (event.key === "ArrowRight") nextPhoto();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerOpen, gallery.length]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center pb-28">
        <p className="text-4xl font-black text-white/35">Cargando perfil...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center pb-28">
        <p className="text-4xl font-black text-white/35">Perfil no encontrado</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pb-32 relative overflow-hidden">
      <div className="absolute inset-0 h-[88vh] w-full z-[1]">
        {profile.fotoPrincipal ? (
          <img
            src={profile.fotoPrincipal}
            alt={profile.username}
            className="w-full h-full object-cover opacity-55"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-[radial-gradient(circle_at_35%_0%,rgba(139,92,246,.22),transparent_45%)]" />
        )}
      </div>

      <div className="absolute inset-0 h-[88vh] bg-gradient-to-b from-black/10 via-black/62 to-black pointer-events-none z-[2]" />
      <div className="absolute inset-x-0 bottom-0 h-[44vh] bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none z-[2]" />

      <button
        type="button"
        onClick={() => openViewer(0)}
        disabled={gallery.length === 0}
        className="absolute inset-0 h-[88vh] w-full z-[3] cursor-zoom-in disabled:cursor-default"
        aria-label="Ver fotos del perfil"
      />

      <section className="relative z-[5] px-8 md:px-24 min-h-[88vh] pointer-events-none">
        <div className="absolute top-10 right-8 md:right-24 z-[30] pointer-events-auto flex gap-3">
          {isOwner && (
            <button
              type="button"
              onClick={() => router.push("/settings/edit")}
              className="rounded-full bg-white text-black px-8 py-4 font-black shadow-2xl"
            >
              Editar perfil
            </button>
          )}

          {isOwner && (
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full border border-violet-400/40 bg-black/45 px-7 py-4 flex items-center gap-3 font-black shadow-[0_0_35px_rgba(139,92,246,.25)]"
            >
              <CheckCircle2 size={22} />
              {copied ? "Link copiado" : "Copiar link"}
              <Copy size={20} />
            </button>
          )}
        </div>

        <div className="absolute left-8 md:left-24 top-[31%] md:top-[31%] -translate-y-1/2 max-w-[900px] z-[12]">
          <h1 className="text-[64px] md:text-[96px] leading-none font-black tracking-tight drop-shadow-2xl">
            {profile.username}
          </h1>

          {profile.mostrarProvincia && profile.provincia && (
            <p className="mt-5 text-2xl md:text-3xl font-black text-white/55">
              {profile.provincia}
            </p>
          )}

          {lastSeenLabel ? (
            <p className="mt-4 text-xl md:text-2xl font-black text-white/55">
              {lastSeenLabel}
            </p>
          ) : null}
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 bottom-[24vh] md:bottom-[29vh] z-[20] w-full max-w-[1200px] px-8 grid grid-cols-4 gap-4 md:gap-12 pointer-events-auto">
          <StatBubble color="bg-pink-500" value={profile.likes || 0} label="me gusta" icon={<Heart size={44} fill="white" />} />
          <StatBubble color="bg-green-500" value={profile.conversaciones || 0} label="conv." icon={<MessageCircle size={44} fill="white" />} />
          <StatBubble color="bg-violet-500" value={profile.seguidores || 0} label="seguidores" icon={<Users size={44} />} />
          <StatBubble color="bg-sky-400" value={historiasCount} label="historias" icon={<BookOpen size={44} />} />
        </div>

        {profile.bio && (
          <p className="absolute left-8 md:left-24 bottom-[5vh] z-[21] max-w-[760px] text-xl md:text-3xl text-white font-medium leading-tight line-clamp-2 md:line-clamp-none overflow-hidden text-ellipsis pr-2">
            {profile.bio}
          </p>
        )}

        {profile.createdAtLabel && (
          <p className="absolute right-8 md:right-24 bottom-[5vh] z-[21] italic text-white/45 text-lg md:text-xl">
            Perfil creado el {profile.createdAtLabel}
          </p>
        )}
      </section>

      {gallery.length > 1 && (
        <section className="relative z-[6] px-8 md:px-24 -mt-2 mb-8">
          <div className="flex gap-4 overflow-x-auto pb-3">
            {gallery.map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                onClick={() => openViewer(index)}
                className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-white/15 bg-white/5 active:scale-95 transition"
              >
                <img
                  src={photo}
                  alt={`${profile.username} foto ${index + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {viewerOpen && gallery.length > 0 && (
        <div className="fixed inset-0 z-[999999] bg-black/95 flex items-center justify-center">
          <button
            type="button"
            onClick={closeViewer}
            className="absolute top-6 right-6 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center z-[10]"
            aria-label="Cerrar visor"
          >
            <X size={30} />
          </button>

          {gallery.length > 1 && (
            <button
              type="button"
              onClick={prevPhoto}
              className="absolute left-6 w-16 h-16 rounded-full bg-white/10 flex items-center justify-center z-[10]"
              aria-label="Foto anterior"
            >
              <ChevronLeft size={38} />
            </button>
          )}

          <img
            src={gallery[viewerIndex]}
            alt={profile.username}
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-3xl select-none"
            draggable={false}
          />

          {gallery.length > 1 && (
            <button
              type="button"
              onClick={nextPhoto}
              className="absolute right-6 w-16 h-16 rounded-full bg-white/10 flex items-center justify-center z-[10]"
              aria-label="Foto siguiente"
            >
              <ChevronRight size={38} />
            </button>
          )}

          {gallery.length > 1 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-5 py-2 text-white/75 font-black">
              {viewerIndex + 1} / {gallery.length}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function StatBubble({
  color,
  value,
  label,
  icon,
}: {
  color: string;
  value: number;
  label: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className={`${color} w-20 h-20 md:w-28 md:h-28 rounded-full flex items-center justify-center shadow-[0_0_35px_rgba(255,255,255,.12)]`}
      >
        {icon}
      </div>
      <div className="mt-4 text-4xl md:text-5xl font-black">{value}</div>
      <div className="text-white/65 font-medium md:text-xl">{label}</div>
    </div>
  );
}
