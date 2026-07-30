"use client";

import { useEffect, useMemo, useState, useCallback, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Heart, MessageCircle, Users, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { logoutAndResetAnon } from "@/lib/auth/logout";
import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { isMainTabRouteHandledByKeepAlive } from "@/components/navigation/MainTabKeepAliveHost";
import {
  getMainTabKeepAliveVersion,
  subscribeMainTabKeepAlive,
} from "@/lib/navigation/mainTabKeepAlive";
import ProfileEntryGate from "@/components/profile/ProfileEntryGate";
import HeaderControls from "@/components/HeaderControls";
import ModernPublicProfile from "@/components/modern/ModernPublicProfile";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { useSettingsTabPaint } from "@/hooks/useSettingsTabPaint";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { settingsPipelineMark } from "@/lib/perf/settingsPipelineTrace";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import ProfileCreatedFooter from "@/components/profile/ProfileCreatedFooter";
import ProfileModerationTag from "@/components/profile/ProfileModerationTag";
import RoleplayAppealFlagButton from "@/components/profile/RoleplayAppealFlagButton";
import AdminClaimReplyBanner from "@/components/profile/AdminClaimReplyBanner";
import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import ProfileVideoViewer from "@/components/profile/ProfileVideoViewer";
import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import { useUxMode } from "@/contexts/UxModeContext";
import { useLocale, useT } from "@/contexts/LocaleContext";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { isActiveWithinWindow } from "@/lib/presence";
import { resolvePublicProfileCreatedLabel } from "@/lib/profile/profileCreatedLabel";
import { resolveProfileLastSeenLabel } from "@/lib/profile/resolveProfileLastSeenLabel";
import { resolveProfileCoverPhoto,
  resolveProfileCoverVideo,
} from "@/lib/profile/resolveProfileCover";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { getClassicProfileUiTokens } from "@/lib/shuffle/classicProfileScale";

const SETTINGS_PROFILE_CACHE_KEY = "sayittome:settings-self-profile:v1";

function readSettingsProfileCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSettingsProfileCache(profile: unknown) {
  if (typeof window === "undefined" || !profile) return;
  try {
    window.sessionStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore quota errors.
  }
}

type MediaItem = {
  url: string;
  type: "image" | "video";
};

export function SettingsRouteContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { uxMode } = useUxMode();
  const { locale } = useLocale();
  const t = useT();

  const [loading, setLoading] = useState(() => !readSettingsProfileCache());
  const [profile, setProfile] = useState<any>(() => readSettingsProfileCache());
  const [authKnown, setAuthKnown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showAnonGate, setShowAnonGate] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const { density } = useClassicShuffleDensity();
  const profileUi = getClassicProfileUiTokens(density);
  const formatLastSeen = useFormatLastSeen();

  useSettingsTabPaint({ loading, profile, showAnonGate, authKnown: authKnown || Boolean(profile) });
  useNavUsefulPaint(!loading && (Boolean(profile) || showAnonGate), "/settings");

  const loadProfile = useCallback(async (user: { uid: string }) => {
    const ref = doc(db, "usuarios", user.uid);

    try {
      const cached = await getDoc(ref);
      if (cached.exists()) {
        const nextProfile = { ...cached.data(), uid: user.uid };
        if (isNavTraceEnabled()) {
          settingsPipelineMark("memory-profile-hit");
        }
        setProfile(nextProfile);
        writeSettingsProfileCache(nextProfile);
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error("settings_profile_load_cache", error);
    }

    try {
      const snap = await getDocFromServer(ref);
      const nextProfile = snap.exists() ? { ...snap.data(), uid: user.uid } : { uid: user.uid };
      setProfile(nextProfile);
      writeSettingsProfileCache(nextProfile);
    } catch (error) {
      console.error("settings_profile_load", error);
      try {
        const snap = await getDoc(ref);
        setProfile(snap.exists() ? { ...snap.data(), uid: user.uid } : { uid: user.uid });
      } catch (fallbackError) {
        console.error("settings_profile_load_fallback", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthKnown(true);
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
    if (profile) {
      void loadProfile(user);
      return;
    }

    setLoading(true);
    void loadProfile(user);
  }, [loadProfile, pathname, profile]);

  const localeTag =
    locale === "es"
      ? "es-AR"
      : locale === "en"
        ? "en-US"
        : locale === "it"
          ? "it-IT"
          : "de-DE";
  const username = profile?.username || profile?.nombre || t("settings_no_username");
  const ownerUid = String(profile?.uid || auth.currentUser?.uid || "");
  const ownerUsername = String(profile?.username || profile?.nombre || username || "usuario");
  const bio = profile?.bio || profile?.descripcion || t("settings_bio_empty");
  const createdAtLabel = resolvePublicProfileCreatedLabel(profile, localeTag);
  const lastSeenLabel = resolveProfileLastSeenLabel(
    profile,
    true,
    formatLastSeen,
    profile ? isActiveWithinWindow(profile.presenceAt, profile.lastActiveAt || profile.lastActive) : false,
  );

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

  if (loading && !profile) {
    return (
      <main
        data-nav-settings-primary
        className="min-h-screen bg-black text-white flex items-center justify-center"
      >
        <p className="text-3xl font-black">{t("settings_loading")}</p>
      </main>
    );
  }

  if (showAnonGate) {
    return <ProfileEntryGate />;
  }

  if (uxMode === "modern" && profile) {
    const username = String(profile.username || profile.nombre || "usuario");

    return (
      <div data-nav-settings-primary>
        {ownerUid ? (
          <div className="mx-auto max-w-[1500px] px-4 pt-4">
            <AdminClaimReplyBanner uid={ownerUid} />
          </div>
        ) : null}
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
          originalCreatedAt: profile.originalCreatedAt,
          createdAt: profile.createdAt,
          fechaCreacion: profile.fechaCreacion,
          fechaRegistro: profile.fechaRegistro,
          registrationDate: profile.registrationDate,
          lastActive: String(profile.lastActiveAt || profile.lastSeenAt || profile.lastActive || ""),
          presenceAt: String(profile.lastActiveAt || profile.lastSeenAt || profile.presenceAt || ""),
          online: profile.online === true,
          showOnline: profile.online === true,
          moderationTag: String(profile.moderationTag || ""),
        }}
        isOwner
        verifiedVisit={false}
        showShuffleBack={false}
        onEdit={() => fastRouterPush(router, "/settings/edit")}
        onLogout={() => void handleLogout()}
        />
      </div>
    );
  }

  return (
    <main data-nav-settings-primary className="min-h-screen bg-black text-white pb-28">
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

        {profile?.moderationTag === "roleplay" && ownerUid ? (
          <div className="pointer-events-auto absolute left-6 top-[max(2.5rem,env(safe-area-inset-top))] z-20 flex items-center gap-2.5 sm:left-10">
            <RoleplayAppealFlagButton
              uid={ownerUid}
              username={ownerUsername}
              minimal
            />
            <ProfileModerationTag tag={String(profile.moderationTag)} compact />
          </div>
        ) : null}

        {ownerUid ? (
          <div className="relative z-20 mx-auto mb-4 max-w-[1500px]">
            <AdminClaimReplyBanner uid={ownerUid} />
          </div>
        ) : null}

        <div className="relative z-10 mx-auto max-w-[1500px]">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <HeaderControls />
            {isAdminEmail(auth.currentUser?.email) ? (
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="rounded-full border border-violet-400/40 bg-violet-500/15 px-8 py-4 font-black text-violet-100"
              >
                {t("settings_admin_panel")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fastRouterPush(router, "/settings/edit")}
              className="rounded-full bg-white px-9 py-4 font-black text-black shadow-[0_0_30px_rgba(255,255,255,.18)]"
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

            {lastSeenLabel ? (
              <p
                className="mt-5 font-black text-white/70"
                style={{ fontSize: profileUi.lastSeenSizeMd }}
              >
                {lastSeenLabel}
              </p>
            ) : null}
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
              className="absolute right-6 sm:right-10 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[21] pointer-events-none px-0 pb-0 pt-0"
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
          {...viewerSwipe.bind()}
          className={`fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-5 ${viewerSwipe.touchActionClass}`}
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
              className="max-w-full max-h-full object-contain rounded-[24px] pointer-events-none select-none"
              draggable={false}
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

export default function SettingsPage() {
  const pathname = usePathname();

  useSyncExternalStore(
    subscribeMainTabKeepAlive,
    getMainTabKeepAliveVersion,
    getMainTabKeepAliveVersion,
  );

  if (isMainTabRouteHandledByKeepAlive(pathname, "/settings")) {
    return null;
  }

  return <SettingsRouteContent />;
}




