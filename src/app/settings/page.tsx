"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Heart, MessageCircle, Users, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { logoutAndResetAnon } from "@/lib/auth/logout";
import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import ProfileEntryGate from "@/components/profile/ProfileEntryGate";
import HeaderControls from "@/components/HeaderControls";
import ModernPublicProfile from "@/components/modern/ModernPublicProfile";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import ProfileCreatedFooter from "@/components/profile/ProfileCreatedFooter";
import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import ProfileVideoViewer from "@/components/profile/ProfileVideoViewer";
import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import { useLocaleDateFormatter } from "@/hooks/useLocaleFormatters";
import {
  resolveProfileCoverPhoto,
  resolveProfileCoverVideo,
} from "@/lib/profile/resolveProfileCover";
import { getClassicProfileUiTokens } from "@/lib/shuffle/classicProfileScale";

type MediaItem = {
  url: string;
  type: "image" | "video";
};

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { uxMode } = useUxMode();
  const t = useT();
  const formatDate = useLocaleDateFormatter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showAnonGate, setShowAnonGate] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const { density } = useClassicShuffleDensity();
  const profileUi = getClassicProfileUiTokens(density);

  const loadProfile = useCallback(async (user: { uid: string }) => {
    const ref = doc(db, "usuarios", user.uid);

    try {
      const snap = await getDocFromServer(ref);
      setProfile(snap.exists() ? { uid: user.uid, ...snap.data() } : { uid: user.uid });
    } catch (error) {
      console.error("settings_profile_load", error);
      try {
        const snap = await getDoc(ref);
        setProfile(snap.exists() ? { uid: user.uid, ...snap.data() } : { uid: user.uid });
      } catch (fallbackError) {
        console.error("settings_profile_load_fallback", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setShowAnonGate(true);
        setLoading(false);
        return;
      }

      if (!user.emailVerified) {
        router.replace("/register/verify-email");
        return;
      }

      const next = await resolvePostAuthPath(user.uid, true);
      if (next === "/register/setup") {
        router.replace("/register/setup");
        return;
      }

      if (next !== "/settings") {
        router.replace(next);
        return;
      }

      await loadProfile(user);
    });

    function refreshProfileOnFocus() {
      const user = auth.currentUser;
      if (!user || document.visibilityState !== "visible") return;
      void loadProfile(user);
    }

    window.addEventListener("focus", refreshProfileOnFocus);
    document.addEventListener("visibilitychange", refreshProfileOnFocus);

    return () => {
      unsub();
      window.removeEventListener("focus", refreshProfileOnFocus);
      document.removeEventListener("visibilitychange", refreshProfileOnFocus);
    };
  }, [loadProfile, router]);

  useEffect(() => {
    if (pathname !== "/settings") return;

    const user = auth.currentUser;
    if (!user?.emailVerified) return;

    setLoading(true);
    void loadProfile(user);
  }, [loadProfile, pathname]);

  const username = profile?.username || profile?.nombre || t("settings_no_username");
  const bio = profile?.bio || profile?.descripcion || t("settings_bio_empty");
  const createdAtLabel = formatDate(profile?.originalCreatedAt || profile?.createdAt);

  const media = useMemo<MediaItem[]>(() => {
    const fotos = Array.isArray(profile?.fotos)
      ? profile.fotos.map((url: string) => ({ url, type: "image" as const }))
      : [];

    const videos = Array.isArray(profile?.videos)
      ? profile.videos.map((url: string) => ({ url, type: "video" as const }))
      : [];

    let merged = [...fotos, ...videos];

    if (merged.length === 0 && profile?.fotoPrincipal) {
      merged.push({
        url: profile.fotoPrincipal,
        type: isVideoMediaUrl(profile.fotoPrincipal) ? "video" : "image",
      });
    }

    const principalUrl = String(profile?.fotoPrincipal || "").trim();
    if (principalUrl) {
      const withoutPrincipal = merged.filter((item) => item.url !== principalUrl);
      merged = [
        {
          url: principalUrl,
          type: isVideoMediaUrl(principalUrl) ? "video" : "image",
        },
        ...withoutPrincipal,
      ];
    }

    return merged;
  }, [profile]);

  const coverMedia = media.length > 0 ? media[Math.min(coverIndex, media.length - 1)] : null;
  const coverPhoto =
    coverMedia?.type === "image"
      ? coverMedia.url
      : media.find((item) => item.type === "image")?.url ||
        (profile?.fotoPrincipal && !isVideoMediaUrl(profile.fotoPrincipal)
          ? profile.fotoPrincipal
          : "") ||
        "";
  const coverVideo =
    coverMedia?.type === "video"
      ? coverMedia.url
      : isVideoMediaUrl(profile?.fotoPrincipal)
        ? String(profile.fotoPrincipal)
        : "";
  const selected = selectedIndex === null ? null : media[selectedIndex] || null;

  const previousMedia = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev <= 0 ? media.length - 1 : prev - 1;
    });
  }, [media.length]);

  const nextMedia = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev >= media.length - 1 ? 0 : prev + 1;
    });
  }, [media.length]);

  const prevCover = useCallback(() => {
    if (media.length <= 1) return;
    setCoverIndex((prev) => (prev <= 0 ? media.length - 1 : prev - 1));
  }, [media.length]);

  const nextCover = useCallback(() => {
    if (media.length <= 1) return;
    setCoverIndex((prev) => (prev >= media.length - 1 ? 0 : prev + 1));
  }, [media.length]);

  const coverSwipe = useHorizontalSwipe({
    enabled: media.length > 1,
    onSwipeLeft: nextCover,
    onSwipeRight: prevCover,
  });

  const viewerSwipe = useHorizontalSwipe({
    enabled: selectedIndex !== null && media.length > 1,
    onSwipeLeft: nextMedia,
    onSwipeRight: previousMedia,
  });

  const closeMediaViewer = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  useOverlayBackClose(
    selectedIndex !== null,
    closeMediaViewer,
    "sayittome-profile-viewer-open",
    "sayittome:close-profile-viewer",
  );

  function openCover() {
    if (!media.length) return;
    const index = Math.max(0, coverIndex);
    const item = media[index];
    if (item?.type === "video") {
      setVideoViewerUrl(item.url);
      return;
    }
    setSelectedIndex(index);
  }

  async function handleLogout() {
    await logoutAndResetAnon();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-3xl font-black">{t("settings_loading")}</p>
      </main>
    );
  }

  if (showAnonGate) {
    return <ProfileEntryGate />;
  }

  if (uxMode === "modern" && profile) {
    const username = String(profile.username || profile.nombre || "usuario");
    const createdAtLabel = formatDate(profile.createdAt);

    return (
      <ModernPublicProfile
        profile={{
          uid: profile.uid,
          email: auth.currentUser?.email || profile.email,
          username,
          bio: String(profile.bio || profile.descripcion || ""),
          provincia: profile.provincia,
          mostrarProvincia: profile.mostrarProvincia !== false,
          mostrarUltimaVez: profile.mostrarUltimaVez !== false,
          fotoPrincipal: String(profile.fotoPrincipal || coverPhoto || coverVideo || ""),
          fotoPortada: resolveProfileCoverPhoto(profile),
          videoPortada: resolveProfileCoverVideo(profile),
          fotos: profile.fotos,
          fotoMediaSources: profile.fotoMediaSources,
          likes: Number(profile.likesCount || profile.likes || 0),
          conversaciones: Number(profile.conversacionesCount || profile.conversaciones || 0),
          seguidores: Number(profile.seguidoresCount || profile.seguidores || 0),
          historias: Number(profile.historiasCount || profile.historias || 0),
          createdAtLabel,
        }}
        isOwner
        verifiedVisit={false}
        showShuffleBack={false}
        onEdit={() => router.push("/settings/edit")}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pb-28">
      <section className="relative min-h-screen overflow-hidden px-6 sm:px-10 lg:px-16 py-10">
        {(coverPhoto || coverVideo) && (
          <div
            role="presentation"
            onClick={() => {
              if (coverSwipe.consumeSwipe()) return;
              openCover();
            }}
            onTouchStart={coverSwipe.onTouchStart}
            onTouchMove={coverSwipe.onTouchMove}
            onTouchEnd={coverSwipe.onTouchEnd}
            className={`absolute inset-0 w-full h-full ${coverSwipe.touchActionClass}`}
          >
            {coverVideo ? (
              <ProfileMediaSurface
                url={coverVideo}
                alt={username}
                videoClassName="w-full h-full object-cover opacity-45 blur-[1px] transition-opacity duration-200"
              />
            ) : (
              <img
                src={coverPhoto}
                alt={username}
                className="w-full h-full object-cover opacity-45 blur-[1px] transition-opacity duration-200"
              />
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/78 to-black/35 pointer-events-none" />

        <div className="relative z-10 max-w-[1500px] mx-auto">
          <div className="flex flex-wrap justify-end items-center gap-3">
            <HeaderControls />
            {isAdminEmail(auth.currentUser?.email) ? (
              <button
                onClick={() => router.push("/admin")}
                className="rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-100 px-8 py-4 font-black"
              >
                {t("settings_admin_panel")}
              </button>
            ) : null}
            <button
              onClick={() => router.push("/settings/edit")}
              className="rounded-full bg-white text-black px-9 py-4 font-black shadow-[0_0_30px_rgba(255,255,255,.18)]"
            >
              {t("profile_edit")}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-full border border-white/20 bg-white/5 px-9 py-4 font-black text-white/80"
            >
              {t("settings_logout")}
            </button>
            {profile?.username || profile?.nombre ? (
              <VerifiedLinkBubble
                username={String(profile.username || profile.nombre)}
                profileUid={profile.uid}
                variant="inline"
              />
            ) : null}
          </div>

          <div className="mt-24">
            <h1
              className="font-black leading-none"
              style={{ fontSize: profileUi.usernameSizeMd }}
            >
              {username}
            </h1>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mt-20">
            {profile?.mostrarLikes !== false && (
              <div className="text-center">
                <div
                  className="mx-auto rounded-full bg-pink-500 flex items-center justify-center shadow-[0_0_45px_rgba(236,72,153,.45)]"
                  style={{ width: profileUi.statBubbleMd, height: profileUi.statBubbleMd }}
                >
                  <Heart size={profileUi.statIcon} fill="white" />
                </div>
                <p className="mt-5 font-black" style={{ fontSize: profileUi.statValueMd }}>
                  {profile?.likesCount || 0}
                </p>
                <p className="text-white/70" style={{ fontSize: profileUi.statLabelMd }}>
                  {t("settings_likes")}
                </p>
              </div>
            )}

            {profile?.mostrarConversaciones !== false && (
              <div className="text-center">
                <div
                  className="mx-auto rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_45px_rgba(34,197,94,.45)]"
                  style={{ width: profileUi.statBubbleMd, height: profileUi.statBubbleMd }}
                >
                  <MessageCircle size={profileUi.statIcon} fill="white" />
                </div>
                <p className="mt-5 font-black" style={{ fontSize: profileUi.statValueMd }}>
                  {profile?.conversacionesCount || 0}
                </p>
                <p className="text-white/70" style={{ fontSize: profileUi.statLabelMd }}>
                  {t("settings_conversations")}
                </p>
              </div>
            )}

            {profile?.mostrarSeguidores !== false && (
              <div className="text-center">
                <div
                  className="mx-auto rounded-full bg-violet-500 flex items-center justify-center shadow-[0_0_45px_rgba(139,92,246,.45)]"
                  style={{ width: profileUi.statBubbleMd, height: profileUi.statBubbleMd }}
                >
                  <Users size={profileUi.statIcon} />
                </div>
                <p className="mt-5 font-black" style={{ fontSize: profileUi.statValueMd }}>
                  {profile?.seguidoresCount || 0}
                </p>
                <p className="text-white/70" style={{ fontSize: profileUi.statLabelMd }}>
                  {t("settings_followers")}
                </p>
              </div>
            )}

            <div className="text-center">
              <div
                className="mx-auto rounded-full bg-sky-400 flex items-center justify-center shadow-[0_0_45px_rgba(56,189,248,.45)]"
                style={{ width: profileUi.statBubbleMd, height: profileUi.statBubbleMd }}
              >
                <BookOpen size={profileUi.statIcon} />
              </div>
              <p className="mt-5 font-black" style={{ fontSize: profileUi.statValueMd }}>
                {profile?.historiasCount || 0}
              </p>
              <p className="text-white/70" style={{ fontSize: profileUi.statLabelMd }}>
                {t("settings_stories_stat")}
              </p>
            </div>
          </div>

          <div className="mt-32 max-w-4xl">
            <p className="text-white/82 leading-snug pt-4" style={{ fontSize: profileUi.bioSizeMd }}>
              {bio}
            </p>

            {profile?.mostrarProvincia !== false && profile?.provincia && (
              <p className="mt-8 text-white/38 font-bold" style={{ fontSize: profileUi.provinceSize }}>
                {profile.provincia}
              </p>
            )}
          </div>

          {createdAtLabel ? (
            <ProfileCreatedFooter
              label={t("settings_profile_created", { date: createdAtLabel })}
              style={{ fontSize: profileUi.createdText }}
            />
          ) : null}
        </div>
        <div aria-hidden className="sayittome-nav-scroll-spacer" />
      </section>

      <ProfileVideoViewer
        url={videoViewerUrl || ""}
        open={Boolean(videoViewerUrl)}
        onClose={() => setVideoViewerUrl(null)}
      />

      {selected && (
        <div
          onClick={() => {
            if (viewerSwipe.consumeSwipe()) return;
            setSelectedIndex(null);
          }}
          onTouchStart={viewerSwipe.onTouchStart}
          onTouchMove={viewerSwipe.onTouchMove}
          onTouchEnd={viewerSwipe.onTouchEnd}
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




