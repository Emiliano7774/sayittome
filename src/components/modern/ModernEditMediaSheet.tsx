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
            {uploading ? uploadText || t("common_loading") : t("edit_gallery")}
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

                return (
                  <div
                    key={`${item.url}-${index}`}
                    className="relative aspect-square overflow-hidden rounded-[1.35rem] border border-white/10 bg-zinc-950"
                  >
                    <ProfileMediaSurface
                      url={item.url}
                      imageClassName="h-full w-full object-cover"
                      videoClassName="h-full w-full object-cover"
                    />

                    <div className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black">
                      {item.type === "image" ? <Camera size={12} className="inline" /> : <Film size={12} className="inline" />}
                      {" "}
                      {index + 1}
                    </div>

                    {mode === "cover" ? (
                      <button
                        type="button"
                        onClick={() => onSelectCover(item)}
                        className={[
                          "absolute inset-x-2 bottom-2 rounded-full px-3 py-2 text-[11px] font-black",
                          isCover ? "bg-fuchsia-500 text-white" : "bg-black/75 text-white/85",
                        ].join(" ")}
                      >
                        {isCover ? t("edit_cover_loaded") : t("edit_use_as_cover")}
                      </button>
                    ) : (
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black via-black/70 to-transparent p-2">
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
                    )}

                    {mode === "principal" && isPrincipal ? (
                      <span className="absolute top-2 right-2 rounded-full bg-violet-500 px-2 py-1 text-[10px] font-black">
                        ★
                      </span>
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
