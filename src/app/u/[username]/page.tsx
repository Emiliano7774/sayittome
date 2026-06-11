"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
import { resolveStoryViewerId } from "@/lib/stories/storyAuthor";
import ModernPublicProfile from "@/components/modern/ModernPublicProfile";
import FollowButton from "@/components/FollowButton";
import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import ProfileCreatedFooter from "@/components/profile/ProfileCreatedFooter";
import { useProfileOwner } from "@/hooks/useProfileOwner";
import { useUxMode } from "@/contexts/UxModeContext";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { isActiveWithinWindow } from "@/lib/presence";
import { isVerifiedProfileLink } from "@/lib/profile/verifiedLink";
import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { getCachedFullProfile } from "@/lib/profile/profileCache";
import { prefetchOwnerStories, refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";
import { getClassicProfileUiTokens } from "@/lib/shuffle/classicProfileScale";

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

  const [profile, setProfile] = useState<Profile | null>(() => {
    const cached = usernameParam ? getCachedFullProfile(usernameParam) : null;
    return (cached as Profile | null) || null;
  });
  const [loading, setLoading] = useState(() => {
    if (!usernameParam) return true;
    return !getCachedFullProfile(usernameParam);
  });
  const [currentUid, setCurrentUid] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const { density } = useClassicShuffleDensity();
  const profileUi = getClassicProfileUiTokens(density);
  const formatLastSeen = useFormatLastSeen();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    async function load() {
      const cached = getCachedFullProfile(usernameParam);
      if (cached) {
        setProfile(cached as Profile);
        setLoading(false);
      }

      try {
        if (!cached) setLoading(true);
        const next = (await fetchProfileByUsername(usernameParam)) as Profile | null;
        setProfile(next);
      } catch {
        if (!cached) setProfile(null);
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
    refreshStoriesIndex(resolveStoryViewerId(auth.currentUser), false).catch(() => {});
    prefetchOwnerStories(profile.uid, profile.username);
  }, [profile?.uid, profile?.username, currentUid]);

  const heartbeat = profile?.presenceAt || profile?.lastActive;
  const isOnline = profile
    ? isActiveWithinWindow(profile.presenceAt, profile.lastActive)
    : false;
  const lastSeenLabel = profile ? formatLastSeen(heartbeat, isOnline) : "";

  function openViewer(index = 0) {
    if (gallery.length === 0) return;
    setViewerIndex(index);
    setViewerOpen(true);
  }

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  useOverlayBackClose(
    viewerOpen,
    closeViewer,
    "sayittome-profile-viewer-open",
    "sayittome:close-profile-viewer",
  );

  function prevPhoto() {
    if (gallery.length === 0) return;
    setViewerIndex((v) => (v - 1 + gallery.length) % gallery.length);
  }

  function nextPhoto() {
    if (gallery.length === 0) return;
    setViewerIndex((v) => (v + 1) % gallery.length);
  }

  const prevHero = useCallback(() => {
    if (gallery.length <= 1) return;
    setHeroIndex((v) => (v - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const nextHero = useCallback(() => {
    if (gallery.length <= 1) return;
    setHeroIndex((v) => (v + 1) % gallery.length);
  }, [gallery.length]);

  const heroSwipe = useHorizontalSwipe({
    enabled: gallery.length > 1,
    onSwipeLeft: nextHero,
    onSwipeRight: prevHero,
  });

  const viewerSwipe = useHorizontalSwipe({
    enabled: viewerOpen && gallery.length > 1,
    onSwipeLeft: nextPhoto,
    onSwipeRight: prevPhoto,
  });

  useEffect(() => {
    setHeroIndex(0);
  }, [usernameParam, gallery.length]);

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

  const heroPhoto = gallery[heroIndex] || profile.fotoPrincipal || "";

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black pb-32 text-white">
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-[1] w-screen max-w-none -translate-x-1/2 overflow-hidden bg-black"
        style={{ height: profileUi.heroHeight }}
      >
        <div
          role="presentation"
          onClick={() => {
            if (heroSwipe.consumeSwipe()) return;
            if (gallery.length > 0) openViewer(heroIndex);
          }}
          onTouchStart={heroSwipe.onTouchStart}
          onTouchMove={heroSwipe.onTouchMove}
          onTouchEnd={heroSwipe.onTouchEnd}
          className={`pointer-events-auto relative h-full w-full ${heroSwipe.touchActionClass}`}
        >
          {heroPhoto ? (
            <SensitiveMediaShell
              url={heroPhoto}
              staticRequiresBlur={blurPhoto}
              profile={profile}
              className="relative h-full w-full bg-black"
              overlayLabel="Foto moderada"
            >
              <img
                src={heroPhoto}
                alt={profile.username}
                className="h-full w-full scale-[1.03] object-cover object-center"
                draggable={false}
              />
            </SensitiveMediaShell>
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_35%_0%,rgba(139,92,246,.22),transparent_45%)]" />
          )}
        </div>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-0 z-[2] w-screen max-w-none -translate-x-1/2 bg-gradient-to-b from-black/25 via-black/70 to-black"
        style={{ height: profileUi.heroHeight }}
      />

      <section
        className="relative z-[5] px-8 md:px-24 pointer-events-none"
        style={{ minHeight: profileUi.heroHeight }}
      >
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] inset-x-4 z-[30] pointer-events-auto flex flex-col items-end gap-3 md:inset-x-auto md:right-8 md:left-auto md:top-10">
          <ClassicUxModeBar className="max-w-full" />

          <div className="flex flex-wrap items-center justify-end gap-3">
          {!isOwner ? <FollowButton targetUid={profile.uid} variant="profileClassic" /> : null}

          {isOwner && (
            <button
              type="button"
              onClick={() => router.push("/settings/edit")}
              className="rounded-full bg-white text-black font-black shadow-2xl"
              style={{
                paddingInline: profileUi.editBtnPx,
                paddingBlock: profileUi.editBtnPy,
                fontSize: profileUi.editBtnText,
              }}
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
          <h1
            className="leading-none font-black tracking-tight drop-shadow-2xl"
            style={{ fontSize: profileUi.usernameSize }}
          >
            {profile.username}
          </h1>

          {verifiedVisit ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-violet-500/15 px-5 py-2 text-sm md:text-base font-black text-violet-100">
              <CheckCircle2 size={18} />
              Perfil abierto desde link oficial
            </p>
          ) : null}

          {profile.mostrarProvincia && profile.provincia && (
            <p
              className="mt-5 font-black text-white/55"
              style={{ fontSize: profileUi.provinceSize }}
            >
              {profile.provincia}
            </p>
          )}
        </div>

        {lastSeenLabel ? (
          <p
            className="pointer-events-none absolute left-8 md:left-24 z-[18] max-w-[900px] font-black text-white/70"
            style={{
              top: "42%",
              fontSize: profileUi.lastSeenSizeMd,
            }}
          >
            {lastSeenLabel}
          </p>
        ) : null}

        <div className="absolute left-1/2 -translate-x-1/2 bottom-[24vh] md:bottom-[29vh] z-[20] w-full max-w-[1200px] px-8 grid grid-cols-4 gap-4 md:gap-12 pointer-events-none">
          <StatBubble color="bg-pink-500" value={profile.likes || 0} label="me gusta" icon={<Heart size={profileUi.statIcon} fill="white" />} ui={profileUi} />
          <StatBubble
            color="bg-green-500"
            value={profile.conversaciones || 0}
            label="conv."
            icon={<MessageCircle size={profileUi.statIcon} fill="white" />}
            ui={profileUi}
            onClick={() => router.push(`/u/${encodeURIComponent(profile.username)}/chat`)}
          />
          <StatBubble color="bg-violet-500" value={profile.seguidores || 0} label="seguidores" icon={<Users size={profileUi.statIcon} />} ui={profileUi} />
          <StatBubble
            color="bg-sky-400"
            value={storyStatus.hasActive ? storyStatus.storyCount : historiasCount}
            label="historias"
            icon={<BookOpen size={profileUi.statIcon} />}
            ui={profileUi}
            onClick={
              storyStatus.hasActive && storyStatus.hasUnseen && storyStatus.storyPath
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
          <p
            className="absolute left-8 md:left-24 bottom-[5vh] z-[21] max-w-[760px] text-white font-medium leading-tight line-clamp-2 md:line-clamp-none overflow-hidden text-ellipsis pr-2"
            style={{ fontSize: profileUi.bioSize }}
          >
            {profile.bio}
          </p>
        )}
      </section>

      {gallery.length > 1 && (
        <section className="relative z-[6] mb-8 mt-4 bg-black px-8 md:px-24">
          <div className="flex gap-4 overflow-x-auto pb-3">
            {gallery.map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                onClick={() => {
                  setHeroIndex(index);
                  openViewer(index);
                }}
                className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black active:scale-95 transition"
                style={{ width: profileUi.thumb, height: profileUi.thumb }}
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

      {profile.createdAtLabel ? (
        <ProfileCreatedFooter
          label={`Perfil creado el ${profile.createdAtLabel}`}
          className="relative z-[6] bg-black"
          style={{ fontSize: profileUi.createdText }}
        />
      ) : null}

      {viewerOpen && gallery.length > 0 && (
        <div
          className="fixed inset-0 z-[999999] bg-black/95 flex items-center justify-center"
          onClick={(event) => {
            if (viewerSwipe.consumeSwipe()) return;
            if (event.target === event.currentTarget) closeViewer();
          }}
          onTouchStart={viewerSwipe.onTouchStart}
          onTouchMove={viewerSwipe.onTouchMove}
          onTouchEnd={viewerSwipe.onTouchEnd}
        >
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
  ui,
}: {
  color: string;
  value: number;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  ring?: boolean;
  ringSeen?: boolean;
  ui: ReturnType<typeof getClassicProfileUiTokens>;
}) {
  const bubble = (
    <div
      className={[
        `${color} flex items-center justify-center rounded-full shadow-[0_0_35px_rgba(255,255,255,.12)]`,
        ring
          ? "ring-4 ring-violet-400/70"
          : ringSeen
            ? "ring-4 ring-zinc-600/80"
            : "",
      ].join(" ")}
      style={{ width: ui.statBubble, height: ui.statBubble }}
    >
      {icon}
    </div>
  );

  return (
    <div className="pointer-events-auto flex flex-col items-center justify-center">
      {onClick ? (
        <button type="button" onClick={onClick} className="active:scale-95 transition">
          {bubble}
        </button>
      ) : (
        bubble
      )}
      <div className="mt-4 font-black" style={{ fontSize: ui.statValue }}>
        {value}
      </div>
      <div className="text-white/65 font-medium" style={{ fontSize: ui.statLabel }}>
        {label}
      </div>
    </div>
  );
}
