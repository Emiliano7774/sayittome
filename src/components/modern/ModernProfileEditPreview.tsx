"use client";

import { ImagePlus, UserRound } from "lucide-react";

import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  username: string;
  bio: string;
  provincia: string;
  mostrarProvincia: boolean;
  fotoPrincipal: string;
  fotoPortada: string;
  videoPortada: string;
  onUsernameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onCoverClick: () => void;
  onAvatarClick: () => void;
  onGalleryClick: () => void;
};

export default function ModernProfileEditPreview({
  username,
  bio,
  provincia,
  mostrarProvincia,
  fotoPrincipal,
  fotoPortada,
  videoPortada,
  onUsernameChange,
  onBioChange,
  onCoverClick,
  onAvatarClick,
  onGalleryClick,
}: Props) {
  const t = useT();

  const coverUrl = videoPortada || fotoPortada || fotoPrincipal;

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="absolute -inset-8 rounded-[3rem] bg-fuchsia-500/20 blur-3xl" />

      <section className="relative overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 shadow-2xl shadow-fuchsia-950/40">
        <div className="relative h-80 overflow-hidden">
          {coverUrl ? (
            <ProfileMediaSurface
              url={coverUrl}
              imageClassName="h-full w-full object-cover"
              videoClassName="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-600 via-purple-950 to-black text-sm font-bold text-white/40">
              {t("edit_cover_media")}
            </div>
          )}

          <button
            type="button"
            onClick={onCoverClick}
            className="absolute inset-0 z-[2] flex items-end justify-center bg-gradient-to-t from-black/70 via-black/10 to-transparent p-5"
          >
            <span className="rounded-full border border-white/20 bg-black/55 px-5 py-2.5 text-sm font-black text-white backdrop-blur-sm">
              {t("edit_change_cover")}
            </span>
          </button>
        </div>

        <div className="relative z-10 -mt-[4.75rem] px-6 pb-8">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onAvatarClick}
              className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-fuchsia-400/70"
            >
              {fotoPrincipal ? (
                <ProfileMediaSurface
                  url={fotoPrincipal}
                  imageClassName="h-full w-full object-cover"
                  videoClassName="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-white/35">
                  <UserRound size={42} strokeWidth={1.5} />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-[10px] font-black text-white">
                {t("edit_change_photo")}
              </span>
            </button>

            <button
              type="button"
              onClick={onGalleryClick}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-white/70"
            >
              <ImagePlus size={14} />
              {t("edit_gallery")}
            </button>
          </div>

          <label className="mt-5 block">
            <span className="sr-only">{t("setup_username")}</span>
            <input
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              placeholder={t("setup_username_placeholder")}
              className="w-full bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-white/25"
            />
          </label>

          <label className="mt-3 block">
            <span className="sr-only">{t("edit_bio_label")}</span>
            <textarea
              value={bio}
              onChange={(e) => onBioChange(e.target.value)}
              placeholder={t("edit_bio_placeholder")}
              rows={3}
              className="w-full resize-none bg-transparent text-sm leading-6 text-zinc-400 outline-none placeholder:text-white/25"
            />
          </label>

          {mostrarProvincia && provincia ? (
            <p className="mt-2 text-sm font-normal text-zinc-500">{provincia}</p>
          ) : null}

          <p className="mt-4 rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/10 px-4 py-3 text-center text-xs font-bold text-fuchsia-100/80">
            {t("edit_live_preview_hint")}
          </p>
        </div>
      </section>
    </div>
  );
}
