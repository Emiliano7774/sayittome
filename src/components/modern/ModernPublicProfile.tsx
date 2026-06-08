"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useCallback } from "react";
import { ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, Heart, MessageCircle, Users, X } from "lucide-react";

import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import ProfileCreatedFooter from "@/components/profile/ProfileCreatedFooter";
import FollowButton from "@/components/FollowButton";
import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import HeaderControls from "@/components/HeaderControls";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { isPresenceOnline } from "@/lib/i18n/formatLastSeen";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import { useT } from "@/contexts/LocaleContext";

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
  likes: number;
  conversaciones: number;
  seguidores: number;
  historias?: number;
  stories?: number;
  createdAtLabel?: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  showOnline?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
};

type Props = {
  profile: ModernProfileData;
  isOwner: boolean;
  verifiedVisit: boolean;
  onEdit?: () => void;
  /** When false, hides the shuffle back link (e.g. own /settings view). */
  showShuffleBack?: boolean;
};

export default function ModernPublicProfile({
  profile,
  isOwner,
  verifiedVisit,
  onEdit,
  showShuffleBack = true,
}: Props) {
  const router = useRouter();
  const t = useT();
  const formatLastSeen = useFormatLastSeen();
  const story = useStoryStatus(profile.uid, profile.username);
  const blurPhoto = profilePhotoRequiresBlur(profile);
  const heartbeat = profile.presenceAt || profile.lastActive;
  const isOnline = isPresenceOnline(heartbeat, profile.online);
  const lastSeen = isOnline ? "" : formatLastSeen(heartbeat, false);
  const historiasCount = story.hasActive
    ? story.storyCount
    : Number(profile.historias || profile.stories || 0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);

  const coverImage = profile.fotoPortada || profile.fotoPrincipal;
  const gallery = useMemo(() => {
    const photos = Array.isArray(profile.fotos) ? profile.fotos.filter(Boolean) : [];
    const merged = [profile.fotoPrincipal, ...photos].filter(Boolean);
    return Array.from(new Set(merged));
  }, [profile.fotoPrincipal, profile.fotos]);
  const profileChatHref = `/u/${encodeURIComponent(profile.username)}/chat`;

  function openViewer(index = 0) {
    if (gallery.length === 0) return;
    setViewerIndex(index);
    setViewerOpen(true);
  }

  function openPrimary() {
    if (story.hasActive && story.hasUnseen && story.storyPath) {
      router.push(story.storyPath);
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
    enabled: gallery.length > 1 && !profile.videoPortada,
    onSwipeLeft: nextHero,
    onSwipeRight: prevHero,
  });

  const viewerSwipe = useHorizontalSwipe({
    enabled: viewerOpen && gallery.length > 1,
    onSwipeLeft: nextPhoto,
    onSwipeRight: prevPhoto,
  });

  const heroPhoto = gallery[heroIndex] || coverImage;

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
        <header className="mb-5 flex items-center justify-between">
          {showShuffleBack ? (
            <Link
              href="/shuffle"
              className="inline-flex items-center gap-2 text-sm font-black text-white/55 hover:text-white"
            >
              <ArrowLeft size={18} />
              Shuffle
            </Link>
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
                  openViewer(heroIndex);
                }}
                disabled={gallery.length === 0}
                onTouchStart={heroSwipe.onTouchStart}
                onTouchMove={heroSwipe.onTouchMove}
                onTouchEnd={heroSwipe.onTouchEnd}
                className={`absolute inset-0 z-[2] ${heroSwipe.touchActionClass} disabled:cursor-default`}
                aria-label="Ver fotos del perfil"
              />
              {profile.videoPortada ? (
                <SensitiveMediaShell
                  url={profile.videoPortada}
                  mediaType="video"
                  staticRequiresBlur={blurPhoto}
                  profile={profile}
                  className="h-full w-full"
                  overlayLabel={t("profile_cover_moderated")}
                >
                  <video
                    src={profile.videoPortada}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
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
            </div>

            <div className="relative z-10 -mt-[4.75rem] px-6 pb-8">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={openPrimary}
                  className={[
                    "h-28 w-28 shrink-0 overflow-hidden rounded-full bg-zinc-800",
                    story.hasUnseen ? "ring-2 ring-fuchsia-400 ring-offset-0" : "",
                  ].join(" ")}
                >
                  {profile.fotoPrincipal ? (
                    <SensitiveMediaShell
                      url={profile.fotoPrincipal}
                      staticRequiresBlur={blurPhoto}
                      profile={profile}
                      className="h-full w-full"
                      overlayLabel={t("profile_photo_moderated")}
                    >
                      <img
                        src={profile.fotoPrincipal}
                        alt=""
                        className="h-full w-full object-cover"
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

              {lastSeen ? (
                <p className="mt-1 text-sm font-normal text-zinc-500">{lastSeen}</p>
              ) : null}

              {verifiedVisit ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-100">
                  <BadgeCheck size={16} />
                  {t("profile_verified_link")}
                </p>
              ) : null}

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {profile.bio || t("profile_default_bio")}
              </p>

              {profile.mostrarProvincia && profile.provincia ? (
                <p className="mt-2 text-sm font-normal text-zinc-500">{profile.provincia}</p>
              ) : null}

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-fuchsia-500/15 bg-gradient-to-b from-fuchsia-950/30 to-black/50 p-4">
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
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={profileChatHref}
                  prefetch={false}
                  className="flex-1 rounded-full bg-white px-6 py-3.5 text-center text-sm font-normal text-black"
                >
                  {t("profile_open_chat")}
                </Link>
                {!isOwner ? <FollowButton targetUid={profile.uid} /> : null}
                {story.hasActive && story.hasUnseen && story.storyPath ? (
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
              </div>
            </div>
          </section>
        </div>

        {profile.createdAtLabel ? (
          <ProfileCreatedFooter
            label={t("settings_profile_created", { date: profile.createdAtLabel })}
            className="max-w-3xl mx-auto"
          />
        ) : null}
      </div>

      {viewerOpen && gallery.length > 0 ? (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/95"
          onTouchStart={viewerSwipe.onTouchStart}
          onTouchMove={viewerSwipe.onTouchMove}
          onTouchEnd={viewerSwipe.onTouchEnd}
        >
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            className="absolute right-6 top-6 z-[10] flex h-14 w-14 items-center justify-center rounded-full bg-white/10"
            aria-label="Cerrar"
          >
            <X size={30} />
          </button>

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
              className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain"
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
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center text-white/70">
        {icon}
      </div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[11px] font-bold text-white/45">{label}</p>
    </div>
  );
}
