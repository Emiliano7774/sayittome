"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Users,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import ModernPublicProfile from "@/components/modern/ModernPublicProfile";
import FollowButton from "@/components/FollowButton";
import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import { useProfileOwner } from "@/hooks/useProfileOwner";
import { useUxMode } from "@/contexts/UxModeContext";
import { formatLastSeen, isRecentlyActive } from "@/lib/presence";
import { isVerifiedProfileLink } from "@/lib/profile/verifiedLink";
import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { prefetchOwnerStories, refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";

type Profile = {
  uid: string;
  email: string;
  username: string;
  bio: string;
  provincia: string;
  mostrarProvincia: boolean;
  fotoPrincipal: string;
  fotoPortada?: string;
  videoPortada?: string;
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
  showOnline?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
};

export default function PublicProfilePage() {
  const { uxMode } = useUxMode();
  const params = useParams();
  const router = useRouter();
  const [verifiedVisit, setVerifiedVisit] = useState(false);

  const usernameParam =
    typeof params?.username === "string" ? params.username : "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
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

  const owner = useProfileOwner(profile?.uid, profile?.username || usernameParam);
  const isOwner = owner.ready && owner.isOwner;

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
  const blurPhoto = profile ? profilePhotoRequiresBlur(profile) : false;
  const storyStatus = useStoryStatus(profile?.uid, profile?.username || usernameParam);

  useEffect(() => {
    setVerifiedVisit(isVerifiedProfileLink(window.location.search));
  }, [usernameParam]);

  useEffect(() => {
    if (!profile?.uid) return;
    refreshStoriesIndex(currentUid, false).catch(() => {});
    prefetchOwnerStories(profile.uid, profile.username);
  }, [profile?.uid, profile?.username, currentUid]);

  const heartbeat = profile?.presenceAt || profile?.lastActive;
  const isOnline = profile
    ? isRecentlyActive(heartbeat, profile.online)
    : false;
  const lastSeenLabel =
    profile && !isOnline ? formatLastSeen(heartbeat, false) : "";

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

  if (uxMode === "modern") {
    return (
      <ModernPublicProfile
        profile={{
          uid: profile.uid,
          email: profile.email,
          username: profile.username,
          bio: profile.bio,
          provincia: profile.provincia,
          mostrarProvincia: profile.mostrarProvincia,
          fotoPrincipal: profile.fotoPrincipal,
          fotoPortada: profile.fotoPortada,
          videoPortada: profile.videoPortada,
          fotos: profile.fotos,
          likes: profile.likes,
          conversaciones: profile.conversaciones,
          seguidores: profile.seguidores,
          historias: profile.historias,
          stories: profile.stories,
          createdAtLabel: profile.createdAtLabel,
          lastActive: profile.lastActive,
          presenceAt: profile.presenceAt,
          online: profile.online,
          showOnline: profile.showOnline,
          adminBlurProfilePhoto: profile.adminBlurProfilePhoto,
          adminBlurFotosPerfil: profile.adminBlurFotosPerfil,
        }}
        isOwner={isOwner}
        verifiedVisit={verifiedVisit}
        onEdit={isOwner ? () => router.push("/settings/edit") : undefined}
      />
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pb-32 relative overflow-hidden">
      <div className="absolute inset-0 h-[88vh] w-full z-[1]">
        {profile.fotoPrincipal ? (
          <SensitiveMediaShell
            url={profile.fotoPrincipal}
            staticRequiresBlur={blurPhoto}
            profile={profile}
            className="relative h-full w-full"
            overlayLabel="Foto moderada"
          >
            <img
              src={profile.fotoPrincipal}
              alt={profile.username}
              className="w-full h-full object-cover opacity-55"
              draggable={false}
            />
          </SensitiveMediaShell>
        ) : (
          <div className="w-full h-full bg-[radial-gradient(circle_at_35%_0%,rgba(139,92,246,.22),transparent_45%)]" />
        )}
      </div>

      <div className="absolute inset-0 h-[88vh] bg-gradient-to-b from-black/10 via-black/62 to-black pointer-events-none z-[2]" />
      <div className="absolute inset-x-0 bottom-0 h-[44vh] bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none z-[2]" />

      {storyStatus.hasActive ? (
        <div
          className={[
            "absolute inset-0 h-[88vh] w-full z-[4] pointer-events-none",
            storyStatus.hasUnseen
              ? "shadow-[inset_0_0_0_4px_rgba(167,139,250,.55)]"
              : "shadow-[inset_0_0_0_4px_rgba(82,82,91,.65)]",
          ].join(" ")}
          aria-hidden
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (storyStatus.hasActive && storyStatus.storyPath) {
            router.push(storyStatus.storyPath);
            return;
          }
          openViewer(0);
        }}
        disabled={!storyStatus.hasActive && gallery.length === 0}
        className="absolute inset-0 h-[88vh] w-full z-[3] cursor-pointer disabled:cursor-default"
        aria-label={
          storyStatus.hasActive
            ? `Ver historias de ${profile.username}`
            : "Ver fotos del perfil"
        }
      />

      <section className="relative z-[5] px-8 md:px-24 min-h-[88vh] pointer-events-none">
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] inset-x-4 z-[30] pointer-events-auto flex flex-col items-end gap-3 md:inset-x-auto md:right-8 md:left-auto md:top-10">
          <ClassicUxModeBar className="max-w-full" />

          <div className="flex flex-wrap items-center justify-end gap-3">
          {!isOwner ? <FollowButton targetUid={profile.uid} variant="profileClassic" /> : null}

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
            <VerifiedLinkBubble
              username={profile.username}
              profileUid={profile.uid}
              variant="inline"
            />
          )}
          </div>
        </div>

        <div className="absolute left-8 md:left-24 top-[31%] md:top-[31%] -translate-y-1/2 max-w-[900px] z-[12]">
          <h1 className="text-[64px] md:text-[96px] leading-none font-black tracking-tight drop-shadow-2xl">
            {profile.username}
          </h1>

          {verifiedVisit ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-violet-500/15 px-5 py-2 text-sm md:text-base font-black text-violet-100">
              <CheckCircle2 size={18} />
              Perfil abierto desde link oficial
            </p>
          ) : null}

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
          <StatBubble
            color="bg-sky-400"
            value={storyStatus.hasActive ? storyStatus.storyCount : historiasCount}
            label="historias"
            icon={<BookOpen size={44} />}
            onClick={
              storyStatus.hasActive && storyStatus.storyPath
                ? () => router.push(storyStatus.storyPath!)
                : undefined
            }
            ring={
              storyStatus.hasActive
                ? storyStatus.hasUnseen
                : undefined
            }
            ringSeen={storyStatus.hasActive && !storyStatus.hasUnseen}
          />
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
                <SensitiveMediaShell
                  url={photo}
                  staticRequiresBlur={blurPhoto}
                  profile={profile}
                  galleryContext
                  className="h-full w-full"
                  overlayLabel="Foto moderada"
                >
                  <img
                    src={photo}
                    alt={`${profile.username} foto ${index + 1}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </SensitiveMediaShell>
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

          <SensitiveMediaShell
            url={gallery[viewerIndex]}
            staticRequiresBlur={blurPhoto}
            profile={profile}
            galleryContext
            className="max-w-[92vw] max-h-[88vh]"
            overlayLabel="Foto moderada"
          >
            <img
              src={gallery[viewerIndex]}
              alt={profile.username}
              className="max-w-[92vw] max-h-[88vh] object-contain rounded-3xl select-none"
              draggable={false}
            />
          </SensitiveMediaShell>

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
  onClick,
  ring,
  ringSeen,
}: {
  color: string;
  value: number;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  ring?: boolean;
  ringSeen?: boolean;
}) {
  const bubble = (
    <div
      className={[
        `${color} w-20 h-20 md:w-28 md:h-28 rounded-full flex items-center justify-center shadow-[0_0_35px_rgba(255,255,255,.12)]`,
        ring
          ? "ring-4 ring-violet-400/70"
          : ringSeen
            ? "ring-4 ring-zinc-600/80"
            : "",
      ].join(" ")}
    >
      {icon}
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center">
      {onClick ? (
        <button type="button" onClick={onClick} className="active:scale-95 transition">
          {bubble}
        </button>
      ) : (
        bubble
      )}
      <div className="mt-4 text-4xl md:text-5xl font-black">{value}</div>
      <div className="text-white/65 font-medium md:text-xl">{label}</div>
    </div>
  );
}
