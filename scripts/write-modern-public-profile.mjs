import { writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

const content = `"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Heart, MessageCircle, Users } from "lucide-react";

import VerifiedLinkBubble from "@/components/profile/VerifiedLinkBubble";
import ModernIdentityCard from "@/components/modern/ModernIdentityCard";
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
    router.push(\`/u/\${encodeURIComponent(profile.username)}\`);
  }

  const avatarButton = (
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
        <img src={profile.fotoPrincipal} alt="" className="h-full w-full object-cover" />
      ) : null}
    </button>
  );

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

        <section className="relative">
          {(profile.showOnline || profile.online) ? (
            <span className="absolute right-4 top-4 z-20 rounded-full border border-green-400/30 bg-black/55 px-3 py-1 text-xs font-black text-green-300">
              En línea
            </span>
          ) : null}

          <ModernIdentityCard
            variant="profile"
            username={profile.username}
            avatarUrl={profile.fotoPrincipal}
            coverPhoto={profile.fotoPortada}
            videoPortada={profile.videoPortada}
            blurMedia={blurPhoto}
            showBrand
            avatarSlot={avatarButton}
            subtitle={lastSeen || undefined}
          >
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
                href={\`/u/\${encodeURIComponent(profile.username)}/chat\`}
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
          </ModernIdentityCard>

          {isOwner ? (
            <div className="pointer-events-none absolute right-4 top-[42%] z-20">
              <div className="pointer-events-auto">
                <VerifiedLinkBubble username={profile.username} isOwner={isOwner} />
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
`;

writeFileSync(join(root, "src/components/modern/ModernPublicProfile.tsx"), Buffer.from(content, "utf8"));
console.log("written ModernPublicProfile.tsx utf8", content.length);
