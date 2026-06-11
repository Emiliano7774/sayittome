"use client";

import { Camera, Film, GripVertical, ImagePlus, Star, Trash2, X } from "lucide-react";

import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import { useT } from "@/contexts/LocaleContext";

export type EditMediaItem = {
  url: string;
  type: "image" | "video";
  path?: string;
};

type Props = {
  open: boolean;
  mode: "cover" | "principal" | "gallery";
  media: EditMediaItem[];
  principalIndex: number;
  coverPhoto: string;
  coverVideo: string;
  uploading: boolean;
  uploadText: string;
  onClose: () => void;
  onUpload: () => void;
  onSelectCover: (item: EditMediaItem) => void;
  onSelectPrincipal: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
};

export default function ModernEditMediaSheet({
  open,
  mode,
  media,
  principalIndex,
  coverPhoto,
  coverVideo,
  uploading,
  uploadText,
  onClose,
  onUpload,
  onSelectCover,
  onSelectPrincipal,
  onMove,
  onRemove,
}: Props) {
  const t = useT();

  if (!open) return null;

  const title =
    mode === "cover"
      ? t("edit_cover_media")
      : mode === "principal"
        ? t("edit_profile_photo")
        : t("edit_mosaic_title");

  const uploadLabel =
    mode === "cover"
      ? t("edit_cover_media")
      : mode === "principal"
        ? t("edit_change_photo")
        : t("edit_gallery");

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 px-0 pb-0 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label={t("common_cancel")}
      />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#090909] text-white shadow-[0_-20px_60px_rgba(0,0,0,.55)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-lg font-black">{title}</p>
            <p className="text-xs font-semibold text-white/40">
              {t("edit_files_count", { count: String(media.length) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-500 font-black disabled:opacity-50"
          >
            <ImagePlus size={18} />
            {uploading ? uploadText || t("common_loading") : uploadLabel}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {media.length === 0 ? (
            <p className="py-10 text-center text-sm font-bold text-white/35">
              {t("edit_gallery")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {media.map((item, index) => {
                const isPrincipal = principalIndex === index;
                const isCover =
                  (item.type === "image" && coverPhoto === item.url) ||
                  (item.type === "video" && coverVideo === item.url);

                const tileClassName = [
                  "relative aspect-square overflow-hidden rounded-[1.35rem] border bg-zinc-950",
                  mode === "cover" && isCover
                    ? "border-fuchsia-400 ring-2 ring-fuchsia-400/60"
                    : mode === "principal" && isPrincipal
                      ? "border-violet-400 ring-2 ring-violet-400/60"
                      : "border-white/10",
                ].join(" ");

                return (
                  <div key={`${item.url}-${index}`} className={tileClassName}>
                    {mode === "cover" ? (
                      <button
                        type="button"
                        onClick={() => onSelectCover(item)}
                        className="absolute inset-0 z-[1] appearance-none border-0 bg-transparent p-0"
                        aria-label={isCover ? t("edit_cover_loaded") : t("edit_use_as_cover")}
                      />
                    ) : mode === "principal" ? (
                      <button
                        type="button"
                        onClick={() => onSelectPrincipal(index)}
                        className="absolute inset-0 z-[1] appearance-none border-0 bg-transparent p-0"
                        aria-label={t("edit_profile_photo")}
                      />
                    ) : null}

                    <ProfileMediaSurface
                      url={item.url}
                      imageClassName="h-full w-full object-cover"
                      videoClassName="h-full w-full object-cover"
                    />

                    <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black">
                      {item.type === "image" ? <Camera size={12} className="inline" /> : <Film size={12} className="inline" />}
                      {" "}
                      {index + 1}
                    </div>

                    {mode === "cover" && isCover ? (
                      <span className="pointer-events-none absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500 text-sm font-black text-white">
                        *
                      </span>
                    ) : null}

                    {mode === "principal" && isPrincipal ? (
                      <span className="pointer-events-none absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-sm font-black text-white">
                        ★
                      </span>
                    ) : null}

                    {mode === "gallery" ? (
                      <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center justify-between gap-1 bg-gradient-to-t from-black via-black/70 to-transparent p-2">
                        <button
                          type="button"
                          onClick={() => onMove(index, -1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
                        >
                          <GripVertical size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPrincipal(index)}
                          className={[
                            "flex h-9 w-9 items-center justify-center rounded-full",
                            isPrincipal ? "bg-violet-500" : "bg-white/15",
                          ].join(" ")}
                        >
                          <Star size={16} fill={isPrincipal ? "white" : "none"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(index)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/80"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}

                    {mode === "principal" ? (
                      <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center justify-end gap-1 bg-gradient-to-t from-black via-black/70 to-transparent p-2">
                        <button
                          type="button"
                          onClick={() => onRemove(index)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/80"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
