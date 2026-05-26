"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Heart, MessageCircle, Users } from "lucide-react";

import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import ModernUxBadge from "@/components/modern/ModernUxBadge";
import PublicUxSwitcher from "@/components/ux/PublicUxSwitcher";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import { formatLastSeen } from "@/lib/presence";
export type ModernProfileData = {
  uid: string;
  email?: string;
  username: string;
  bio: string;
  provincia?: string;
  mostrarProvincia?: boolean;
  fotoPrincipal: string;
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
};

export default function ModernPublicProfile({
  profile,
  isOwner,
  verifiedVisit,
  onEdit,
}: Props) {
  const router = useRouter();
  const story = useStoryStatus(profile.uid, profile.username);
  const blurPhoto = profilePhotoRequiresBlur(profile);
  const lastSeen = formatLastSeen(profile.presenceAt || profile.lastActive, profile.online);
  const historiasCount = story.hasActive
    ? story.storyCount
    : Number(profile.historias || profile.stories || 0);

  function openPrimary() {
    if (story.hasActive && story.storyPath) {
      router.push(story.storyPath);
      return;
    }
    router.push(`/u/${encodeURIComponent(profile.username)}`);
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/shuffle"
            className="inline-flex items-center gap-2 text-sm font-black text-white/55 hover:text-white"
          >
            <ArrowLeft size={18} />
            Shuffle
          </Link>
          <div className="flex items-center gap-2">
            <PublicUxSwitcher />
            <ModernUxBadge />
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[32px] border border-violet-500/10 bg-[#0a0a0a] shadow-[0_0_90px_rgba(104,76,255,0.18)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-violet-600/20 to-transparent" />
          <div className="relative h-[360px] overflow-hidden md:h-[400px]">
            {profile.fotoPrincipal ? (
              <>
                <img
                  src={profile.fotoPrincipal}
                  alt={profile.username}
                  className={[
                    "h-full w-full object-cover",
                    blurPhoto ? "blur-2xl scale-110" : "",
                  ].join(" ")}
                />
                {blurPhoto ? <SensitiveBlurOverlay label="Foto moderada" /> : null}
              </>
            ) : (
              <div className="h-full w-full bg-gradient-to-b from-violet-700/40 via-[#12081f] to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

            {profile.showOnline || profile.online ? (
              <span className="absolute right-4 top-4 rounded-full border border-green-400/30 bg-black/55 px-3 py-1 text-xs font-black text-green-300">
                En línea
              </span>
            ) : null}
          </div>

          <div className="relative px-5 pb-5 pt-0">
            <div className="-mt-14 mb-4 flex items-end gap-4">
              <button
                type="button"
                onClick={openPrimary}
                className={[
                  "h-28 w-28 overflow-hidden rounded-full border-4 bg-[#151515] shadow-2xl",
                  story.hasUnseen
                    ? "border-violet-400"
                    : story.hasActive
                      ? "border-zinc-600"
                      : "border-white/15",
                ].join(" ")}
              >
                {profile.fotoPrincipal ? (
                  <img
                    src={profile.fotoPrincipal}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </button>

              <div className="min-w-0 flex-1 pb-1">
                <p className="text-[10px] font-black tracking-[0.22em] text-violet-300/85">
                  SAYITTOME
                </p>
                <h1 className="truncate text-3xl font-black">@{profile.username}</h1>
                {lastSeen ? (
                  <p className="text-sm font-bold text-white/45">{lastSeen}</p>
                ) : null}
              </div>
            </div>

            {verifiedVisit ? (
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-500/10 px-4 py-2 text-sm font-black text-violet-100">
                <BadgeCheck size={16} />
                Perfil abierto desde link oficial
              </p>
            ) : null}

            <p className="text-base font-medium text-white/70">
              {profile.bio || "Perfil SayItToMe en la nueva web React."}
            </p>

            {profile.mostrarProvincia && profile.provincia ? (
              <p className="mt-2 text-sm font-bold text-white/40">{profile.provincia}</p>
            ) : null}

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-violet-500/15 bg-gradient-to-b from-violet-950/30 to-black/50 p-4 shadow-[inset_0_0_40px_rgba(104,76,255,0.06)]">
              <StatItem icon={<Heart size={18} />} value={profile.likes || 0} label="Likes" />
              <StatItem
                icon={<MessageCircle size={18} />}
                value={profile.conversaciones || 0}
                label="Chats"
              />
              <StatItem
                icon={<Users size={18} />}
                value={profile.seguidores || 0}
                label="Seguidores"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/u/${encodeURIComponent(profile.username)}/chat`}
                className="flex-1 rounded-full bg-white px-6 py-3.5 text-center text-sm font-black text-black"
              >
                Abrir chat
              </Link>
              {story.hasActive && story.storyPath ? (
                <Link
                  href={story.storyPath}
                  className="flex-1 rounded-full border border-violet-400/30 bg-violet-600/20 px-6 py-3.5 text-center text-sm font-black text-violet-100"
                >
                  Ver historias ({historiasCount})
                </Link>
              ) : null}
              {isOwner && onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-full border border-white/15 px-5 py-3.5 text-sm font-black"
                >
                  Editar
                </button>
              ) : null}
            </div>
          </div>

          {isOwner ? (
            <div className="pointer-events-none absolute right-4 top-[42%] z-20">
              <div className="pointer-events-auto">
                <VerifiedLinkBubble username={profile.username} />
              </div>
            </div>
          ) : null}
        </section>

        {profile.createdAtLabel ? (
          <p className="mt-4 text-center text-sm italic text-white/35">
            Perfil creado el {profile.createdAtLabel}
          </p>
        ) : null}
      </div>
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
