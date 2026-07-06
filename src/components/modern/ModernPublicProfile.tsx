"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Users,
  X,
} from "lucide-react";

import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import ProfileVideoViewer from "@/components/profile/ProfileVideoViewer";
import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import ProfileCreatedFooter from "@/components/profile/ProfileCreatedFooter";
import FollowButton from "@/components/FollowButton";
import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import HeaderControls from "@/components/HeaderControls";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { isPresenceOnline } from "@/lib/i18n/formatLastSeen";
import { resolvePublicProfileCreatedLabel } from "@/lib/profile/profileCreatedLabel";
import { resolveProfileMediaSourceForUrl } from "@/lib/profile/mediaSource";
import { resolveProfileLastSeenLabel } from "@/lib/profile/resolveProfileLastSeenLabel";
import {
  resolveProfileCoverPhoto,
  resolveProfileCoverVideo,
} from "@/lib/profile/resolveProfileCover";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  consumePreparedProfileChat,
  prepareProfileChat,
} from "@/lib/chat/profileChatWarmup";
import { recordPathBeforeChatOpen } from "@/lib/navigation/chatBackNavigation";
import { fastRouterPush, fastRouterReplace } from "@/lib/navigation/fastNavigate";
import { stashStoryReturnTo } from "@/lib/navigation/storyReturnNav";
import {
  consumeProfileReturnTo,
  peekProfileReturnTo,
} from "@/lib/navigation/profileReturnNav";
import ProfileModerationTag from "@/components/profile/ProfileModerationTag";
import AdminProfileRoleplayButton from "@/components/profile/AdminProfileRoleplayButton";
import RoleplayAppealFlagButton from "@/components/profile/RoleplayAppealFlagButton";
import ProfileReportButton from "@/components/moderation/ProfileReportButton";
import StoryMediaSourceBadge from "@/components/stories/StoryMediaSourceBadge";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import type { ProfileMediaSource } from "@/lib/profile/mediaSource";
import { useLocale, useT } from "@/contexts/LocaleContext";

export type ModernProfileData = {
  uid: string;
  email?: string;
  username: string;
  bio: string;
  provincia?: string;
  mostrarProvincia?: boolean;
  fotoPrincipal: string;
  fotoPortada?: string;
  videoPortada?: string;
  fotos?: string[];
  fotoMediaSources?: Record<string, ProfileMediaSource>;
  likes: number;
  conversaciones: number;
  seguidores: number;
  historias?: number;
  stories?: number;
  createdAtLabel?: string;
  originalCreatedAt?: string;
  createdAt?: string;
  fechaCreacion?: string;
  fechaRegistro?: string;
  registrationDate?: string;
  _firestoreCreateTime?: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  showOnline?: boolean;
  mostrarUltimaVez?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  moderationTag?: string;
  moderationTagNote?: string;
};

type Props = {
  profile: ModernProfileData;
  isOwner: boolean;
  verifiedVisit: boolean;
  onEdit?: () => void;
  onLogout?: () => void;
  /** When false, hides the shuffle back link (e.g. own /settings view). */
  showShuffleBack?: boolean;
  onModerationTagChange?: (moderationTag: string) => void;
};

export default function ModernPublicProfile({
  profile,
  isOwner,
  verifiedVisit,
  onEdit,
  onLogout,
  showShuffleBack = true,
  onModerationTagChange,
}: Props) {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT();
  const formatLastSeen = useFormatLastSeen();
  const localeTag =
    locale === "es"
      ? "es-AR"
      : locale === "en"
        ? "en-US"
        : locale === "it"
          ? "it-IT"
          : "de-DE";
  const createdSignature = resolvePublicProfileCreatedLabel(profile, localeTag);
  const story = useStoryStatus(profile.uid, profile.username);
  const blurPhoto = profilePhotoRequiresBlur(profile);
  const isOnline = isPresenceOnline(profile.presenceAt || profile.lastActive, profile.online);
  const lastSeen = resolveProfileLastSeenLabel(
    profile,
    isOwner,
    formatLastSeen,
    isOnline,
  );
  const historiasCount = story.hasActive
    ? story.storyCount
    : Number(profile.historias || profile.stories || 0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [videoViewerSource, setVideoViewerSource] = useState<ProfileMediaSource | undefined>();

  function mediaSourceForUrl(url: string) {
    return resolveProfileMediaSourceForUrl(profile.fotoMediaSources, url);
  }

  const principalIsVideo = isVideoMediaUrl(profile.fotoPrincipal);
  const coverVideoUrl = resolveProfileCoverVideo(profile);
  const coverPhotoUrl = resolveProfileCoverPhoto(profile);

  const coverImage = coverPhotoUrl || profile.fotoPrincipal;
  const gallery = useMemo(() => {
    const photos = Array.isArray(profile.fotos) ? profile.fotos.filter(Boolean) : [];
    const merged = [coverPhotoUrl, profile.fotoPrincipal, ...photos].filter(Boolean);
    return Array.from(new Set(merged));
  }, [coverPhotoUrl, profile.fotoPrincipal, profile.fotos]);
  function warmProfileChat() {
    prepareProfileChat(profile.username, { promote: true });
  }

  useEffect(() => {
    prepareProfileChat(profile.username);
  }, [profile.username]);

  function openProfileChat() {
    recordPathBeforeChatOpen();
    const prepared = consumePreparedProfileChat(profile.username);
    fastRouterPush(router, prepared?.href || `/chat/${encodeURIComponent(buildProfileAnonChatId(getChatAnonSenderId(), profile.username))}?u=${encodeURIComponent(profile.username)}`);
  }

  function openViewer(index = 0) {
    if (gallery.length === 0) return;
    setViewerIndex(index);
    setViewerOpen(true);
  }

  function openVideo(url: string) {
    setVideoViewerSource(mediaSourceForUrl(url));
    setVideoViewerUrl(url);
  }

  function openStories() {
    if (story.hasActive && story.storyPath) {
      stashStoryReturnTo(window.location.pathname);
      fastRouterPush(router, story.storyPath);
    }
  }

  function openPrimary() {
    if (story.hasActive && story.storyPath) {
      stashStoryReturnTo(window.location.pathname);
      fastRouterPush(router, story.storyPath);
      return;
    }
    if (principalIsVideo && profile.fotoPrincipal) {
      openVideo(profile.fotoPrincipal);
      return;
    }
    openViewer(heroIndex);
  }

  function openHero() {
    if (coverVideoUrl) {
      openVideo(coverVideoUrl);
      return;
    }
    openViewer(heroIndex);
  }

  const prevPhoto = useCallback(() => {
    if (gallery.length <= 1) return;
    setViewerIndex((v) => (v - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const nextPhoto = useCallback(() => {
    if (gallery.length <= 1) return;
    setViewerIndex((v) => (v + 1) % gallery.length);
  }, [gallery.length]);

  const prevHero = useCallback(() => {
    if (gallery.length <= 1) return;
    setHeroIndex((v) => (v - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const nextHero = useCallback(() => {
    if (gallery.length <= 1) return;
    setHeroIndex((v) => (v + 1) % gallery.length);
  }, [gallery.length]);

  const heroSwipe = useHorizontalSwipe({
    enabled: gallery.length > 1 && !coverVideoUrl,
    onSwipeLeft: nextHero,
    onSwipeRight: prevHero,
  });

  const handleProfileBack = useCallback(() => {
    const returnTo = peekProfileReturnTo() || "/shuffle";
    consumeProfileReturnTo();
    fastRouterReplace(router, returnTo);
  }, [router]);

  const viewerSwipe = useHorizontalSwipe({
    enabled: viewerOpen && gallery.length > 1,
    minDistance: 32,
    onSwipeLeft: nextPhoto,
    onSwipeRight: prevPhoto,
  });

  const heroPhoto = coverPhotoUrl || gallery[heroIndex] || coverImage;

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  useOverlayBackClose(
    viewerOpen,
    closeViewer,
    "sayittome-profile-viewer-open",
    "sayittome:close-profile-viewer",
  );

  useEffect(() => {
    if (!viewerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") prevPhoto();
      if (event.key === "ArrowRight") nextPhoto();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer, nextPhoto, prevPhoto, viewerOpen]);

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
        <header className="mb-5 flex items-center justify-between">
          {showShuffleBack ? (
            <button
              type="button"
              onClick={handleProfileBack}
              className="inline-flex items-center gap-2 text-sm font-black text-white/55 hover:text-white"
            >
              <ArrowLeft size={18} />
              Shuffle
            </button>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isOwner && isAdminEmail(profile.email) ? (
              <Link
                href="/admin"
                className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold text-fuchsia-100"
              >
                {t("settings_admin_panel")}
              </Link>
            ) : null}
            <HeaderControls />
          </div>
        </header>

        <div className="relative mx-auto w-full">
          <div className="absolute -inset-8 rounded-[3rem] bg-fuchsia-500/20 blur-3xl" />
          <section className="relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40">
            <div className="relative z-0 h-80 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  if (heroSwipe.consumeSwipe()) return;
                  openHero();
                }}
                disabled={gallery.length === 0}
                onTouchStart={heroSwipe.onTouchStart}
                onTouchMove={heroSwipe.onTouchMove}
                onTouchEnd={heroSwipe.onTouchEnd}
                className={`absolute inset-0 z-[2] ${heroSwipe.touchActionClass} disabled:cursor-default`}
                aria-label="Ver fotos del perfil"
              />
              {coverVideoUrl ? (
                <SensitiveMediaShell
                  url={coverVideoUrl}
                  mediaType="video"
                  staticRequiresBlur={blurPhoto}
                  profile={profile}
                  className="h-full w-full"
                  overlayLabel={t("profile_cover_moderated")}
                  blockVideoAutoplay={false}
                >
                  <ProfileMediaSurface
                    key={coverVideoUrl}
                    url={coverVideoUrl}
                    videoClassName="h-full w-full object-cover"
                  />
                </SensitiveMediaShell>
              ) : heroPhoto ? (
                <SensitiveMediaShell
                  url={heroPhoto}
                  staticRequiresBlur={blurPhoto}
                  profile={profile}
                  className="h-full w-full"
                  overlayLabel={t("profile_photo_moderated")}
                >
                  <img
                    src={heroPhoto}
                    alt={profile.username}
                    className="h-full w-full object-cover transition-opacity duration-200"
                  />
                </SensitiveMediaShell>
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black" />
              )}

              {isOnline ? (
                <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-green-400/30 bg-black/55 px-3 py-1 text-xs font-black text-green-300 backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,.9)]" />
                  {t("profile_online")}
                </span>
              ) : null}

              <div className="pointer-events-auto absolute left-4 top-4 z-20 flex items-center gap-2">
                {isOwner && profile.moderationTag === "roleplay" && profile.uid ? (
                  <>
                    <RoleplayAppealFlagButton
                      uid={profile.uid}
                      username={profile.username}
                      minimal
                    />
                    <ProfileModerationTag tag={profile.moderationTag} compact />
                  </>
                ) : !isOwner && profile.moderationTag ? (
                  <ProfileModerationTag tag={profile.moderationTag} compact />
                ) : null}
                <AdminProfileRoleplayButton
                  profile={profile}
                  variant="modern"
                  onTagChange={onModerationTagChange}
                />
              </div>
            </div>

            <div className="relative z-10 -mt-[4.75rem] px-6 pb-8">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={openPrimary}
                  className={[
                    "h-28 w-28 shrink-0 overflow-hidden rounded-full bg-zinc-800",
                    story.hasUnseen
                      ? "ring-2 ring-fuchsia-400 ring-offset-0"
                      : story.hasActive
                        ? "ring-2 ring-zinc-600 ring-offset-0"
                        : "",
                  ].join(" ")}
                >
                  {profile.fotoPrincipal ? (
                    <SensitiveMediaShell
                      url={profile.fotoPrincipal}
                      mediaType={principalIsVideo ? "video" : "image"}
                      staticRequiresBlur={blurPhoto}
                      profile={profile}
                      className="h-full w-full"
                      overlayLabel={t("profile_photo_moderated")}
                      blockVideoAutoplay={false}
                    >
                      <ProfileMediaSurface
                        url={profile.fotoPrincipal}
                        imageClassName="h-full w-full object-cover"
                        videoClassName="h-full w-full object-cover"
                      />
                    </SensitiveMediaShell>
                  ) : null}
                </button>

                {isOwner ? (
                  <div className="pt-2">
                    <VerifiedLinkBubble
                      username={profile.username}
                      profileUid={profile.uid}
                      variant="modern"
                    />
                  </div>
                ) : null}
              </div>

              <h1 className="mt-5 truncate text-3xl font-semibold">
                @{profile.username}
              </h1>

              {verifiedVisit ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-100">
                  <BadgeCheck size={16} />
                  {t("profile_verified_link")}
                </p>
              ) : null}

              {profile.mostrarProvincia && profile.provincia ? (
                <p className="mt-2 text-sm font-normal text-zinc-500">{profile.provincia}</p>
              ) : null}

              {lastSeen ? (
                <p className="mt-4 text-base font-semibold text-zinc-400 md:mt-5 md:text-lg">
                  {lastSeen}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl border border-fuchsia-500/15 bg-gradient-to-b from-fuchsia-950/30 to-black/50 p-4">
                <StatItem icon={<Heart size={18} />} value={profile.likes || 0} label={t("profile_likes")} />
                <StatItem
                  icon={<MessageCircle size={18} />}
                  value={profile.conversaciones || 0}
                  label={t("chats_title")}
                />
                <StatItem
                  icon={<Users size={18} />}
                  value={profile.seguidores || 0}
                  label={t("settings_followers")}
                />
                <StatItem
                  icon={<BookOpen size={18} />}
                  value={historiasCount}
                  label={t("settings_stories_stat")}
                  onClick={story.hasActive && story.storyPath ? openStories : undefined}
                  highlight={story.hasActive && story.hasUnseen}
                  seen={story.hasActive && !story.hasUnseen}
                />
              </div>

              <p className="mt-5 text-sm leading-6 text-zinc-400">
                {profile.bio || t("profile_default_bio")}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onPointerDown={warmProfileChat}
                  onClick={openProfileChat}
                  className="flex-1 rounded-full bg-white px-6 py-3.5 text-center text-sm font-normal text-black"
                >
                  {t("profile_open_chat")}
                </button>
                {!isOwner ? <FollowButton targetUid={profile.uid} /> : null}
                {!isOwner ? (
                  <ProfileReportButton
                    targetUid={profile.uid}
                    targetUsername={profile.username}
                  />
                ) : null}
                {story.hasActive && story.storyPath ? (
                  <Link
                    href={story.storyPath}
                    className="flex-1 rounded-full bg-fuchsia-500/30 px-6 py-3.5 text-center text-sm font-normal"
                  >
                    {t("profile_view_stories", { count: String(historiasCount) })}
                  </Link>
                ) : null}
                {isOwner && onEdit ? (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="rounded-full bg-white/10 px-5 py-3.5 text-sm font-normal"
                  >
                    {t("profile_edit_short")}
                  </button>
                ) : null}
                {isOwner && onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-normal text-white/75"
                  >
                    {t("settings_logout")}
                  </button>
                ) : null}
              </div>

              {createdSignature ? (
                <ProfileCreatedFooter
                  label={t("settings_profile_created", { date: createdSignature })}
                  className="mt-8 px-0 pb-0 pt-0 text-right text-xs md:text-sm"
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <ProfileVideoViewer
        url={videoViewerUrl || ""}
        open={Boolean(videoViewerUrl)}
        source={videoViewerSource}
        onClose={() => {
          setVideoViewerUrl(null);
          setVideoViewerSource(undefined);
        }}
      />

      {viewerOpen && gallery.length > 0 ? (
        <div
          className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/95 ${viewerSwipe.touchActionClass}`}
          onClick={(event) => {
            if (viewerSwipe.consumeSwipe()) return;
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <div
            className={`absolute inset-0 z-[6] ${viewerSwipe.touchActionClass}`}
            aria-hidden
            {...viewerSwipe.bind()}
          />

          <button
            type="button"
            onClick={closeViewer}
            className="absolute right-6 top-6 z-[10] flex h-14 w-14 items-center justify-center rounded-full bg-white/10"
            aria-label="Cerrar"
          >
            <X size={30} />
          </button>

          {mediaSourceForUrl(gallery[viewerIndex]) ? (
            <div className="absolute bottom-8 left-1/2 z-[10] -translate-x-1/2">
              <StoryMediaSourceBadge
                source={mediaSourceForUrl(gallery[viewerIndex])}
                mediaType={isVideoMediaUrl(gallery[viewerIndex]) ? "video" : "image"}
              />
            </div>
          ) : null}

          {gallery.length > 1 ? (
            <button
              type="button"
              onClick={() => setViewerIndex((v) => (v - 1 + gallery.length) % gallery.length)}
              className="absolute left-6 z-[10] flex h-16 w-16 items-center justify-center rounded-full bg-white/10"
              aria-label="Foto anterior"
            >
              <ChevronLeft size={38} />
            </button>
          ) : null}

          <SensitiveMediaShell
            url={gallery[viewerIndex]}
            staticRequiresBlur={blurPhoto}
            profile={profile}
            className="max-h-[88vh] max-w-[92vw]"
            overlayLabel={t("profile_photo_moderated")}
          >
            <img
              src={gallery[viewerIndex]}
              alt={profile.username}
              className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain pointer-events-none select-none"
              draggable={false}
            />
          </SensitiveMediaShell>

          {gallery.length > 1 ? (
            <button
              type="button"
              onClick={() => setViewerIndex((v) => (v + 1) % gallery.length)}
              className="absolute right-6 z-[10] flex h-16 w-16 items-center justify-center rounded-full bg-white/10"
              aria-label="Foto siguiente"
            >
              <ChevronRight size={38} />
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function StatItem({
  icon,
  value,
  label,
  onClick,
  highlight,
  seen,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
  seen?: boolean;
}) {
  const content = (
    <>
      <div
        className={[
          "mx-auto mb-1 flex h-8 w-8 items-center justify-center text-white/70",
          highlight ? "rounded-full ring-2 ring-violet-400/70" : "",
          seen ? "rounded-full ring-2 ring-zinc-600/80" : "",
        ].join(" ")}
      >
        {icon}
      </div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[11px] font-bold text-white/45">{label}</p>
    </>
  );

  if (!onClick) {
    return <div className="text-center">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-center transition active:scale-95"
      aria-label={label}
    >
      {content}
    </button>
  );
}
