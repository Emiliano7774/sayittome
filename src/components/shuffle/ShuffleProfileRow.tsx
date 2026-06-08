"use client";

import { memo } from "react";
import { UserRound } from "lucide-react";

import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import AppImage from "@/components/media/AppImage";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export type { ShuffleProfile };

type Props = {
  profile: ShuffleProfile;
  slot: number;
};

function ShuffleProfileRow({ profile, slot }: Props) {
  const username = profile.username || "usuario";
  const bio = profile.bio || "Sin descripcion.";
  const online = profile.showOnline;
  const blurPhoto = profile.blurPhoto;

  return (
    <div className="w-full border-b border-white/10" data-slot={slot}>
      <div className="w-full py-7 flex items-center gap-7">
        <button
          type="button"
          data-action="profile"
          data-username={username}
          className="relative shrink-0 active:scale-95 transition"
          aria-label={`Abrir perfil de ${username}`}
        >
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[#242424] flex items-center justify-center relative">
            {profile.photo ? (
              <SensitiveMediaShell
                url={profile.photo}
                staticRequiresBlur={blurPhoto}
                enableRuntimeScan={false}
                profile={{
                  adminBlurProfilePhoto: profile.adminBlurProfilePhoto,
                  adminBlurFotosPerfil: profile.adminBlurFotosPerfil,
                }}
                className="h-full w-full"
                overlayLabel="Contenido moderado"
              >
                <AppImage
                  src={profile.photo}
                  alt={username}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </SensitiveMediaShell>
            ) : (
              <UserRound size={64} className="text-white/75" />
            )}
          </div>

          {online ? (
            <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-[3px] border-black" />
          ) : null}
        </button>

        <button
          type="button"
          data-action="chat"
          data-username={username}
          className="min-w-0 flex-1 text-left active:scale-[0.99] transition"
          aria-label={`Abrir chat con ${username}`}
        >
          <h2 className="text-3xl md:text-4xl font-black truncate">{username}</h2>
          <p className="mt-2 text-xl md:text-2xl text-white/50 font-bold line-clamp-2">
            {bio}
          </p>
        </button>
      </div>
    </div>
  );
}

function propsEqual(prev: Props, next: Props) {
  const a = prev.profile;
  const b = next.profile;
  return (
    prev.slot === next.slot &&
    a.uid === b.uid &&
    a.username === b.username &&
    a.bio === b.bio &&
    a.photo === b.photo &&
    a.online === b.online &&
    a.showOnline === b.showOnline &&
    a.presenceAt === b.presenceAt &&
    a.lastActive === b.lastActive &&
    a.adminBlurProfilePhoto === b.adminBlurProfilePhoto &&
    a.adminBlurFotosPerfil === b.adminBlurFotosPerfil
  );
}

export default memo(ShuffleProfileRow, propsEqual);
