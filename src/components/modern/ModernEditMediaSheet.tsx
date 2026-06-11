"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Star, X } from "lucide-react";

import MosaicMediaTile from "@/components/modern/MosaicMediaTile";
import { useT } from "@/contexts/LocaleContext";

export type EditMediaItem = {
  url: string;
  type: "image" | "video";
  path?: string;
};

type SheetView = "pick" | "gallery";

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
  onSelectCover: (item: EditMediaItem, closeSheet?: boolean) => void;
  onSelectPrincipal: (index: number, closeSheet?: boolean) => void;
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
  const [view, setView] = useState<SheetView>("pick");

  useEffect(() => {
    if (open) {
      setView(mode === "gallery" ? "gallery" : "pick");
    }
  }, [open, mode]);

  if (!open) return null;

  const isGalleryView = mode === "gallery" || view === "gallery";
  const tapToSelect = !isGalleryView;

  const title =
    mode === "cover"
      ? isGalleryView
        ? t("edit_gallery")
        : t("edit_cover_media")
      : mode === "principal"
        ? isGalleryView
          ? t("edit_gallery")
          : t("edit_profile_photo")
        : t("edit_mosaic_title");

  const uploadLabel =
    mode === "cover"
      ? t("edit_cover_media")
      : mode === "principal"
        ? t("edit_change_photo")
        : t("edit_gallery");

  const hint =
    mode === "cover" && !isGalleryView
      ? t("edit_cover_pick_hint")
      : mode === "principal" && !isGalleryView
        ? t("edit_principal_pick_hint")
        : t("edit_gallery_manage_hint");

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

        {mode !== "gallery" ? (
          <div className="flex gap-2 border-b border-white/10 px-5 py-3">
            <button
              type="button"
              onClick={() => setView("pick")}
              className={[
                "rounded-full px-4 py-2 text-xs font-black",
                view === "pick" ? "bg-violet-500 text-white" : "bg-white/10 text-white/55",
              ].join(" ")}
            >
              {mode === "cover" ? t("edit_cover_media") : t("edit_profile_photo")}
            </button>
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={[
                "rounded-full px-4 py-2 text-xs font-black",
                view === "gallery" ? "bg-violet-500 text-white" : "bg-white/10 text-white/55",
              ].join(" ")}
            >
              {t("edit_gallery")}
            </button>
          </div>
        ) : null}

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
          <p className="mt-3 text-center text-[11px] font-semibold text-white/35">{hint}</p>
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
                  <div key={`${item.url}-${index}`} className="relative">
                    <MosaicMediaTile
                      item={item}
                      index={index}
                      total={media.length}
                      isCover={isCover}
                      isPrincipal={isPrincipal}
                      showCoverBadge={mode === "cover" || isGalleryView}
                      showPrincipalBadge={mode === "principal" || isGalleryView}
                      tapToSelect={tapToSelect}
                      onTap={
                        tapToSelect
                          ? mode === "cover"
                            ? () => onSelectCover(item, true)
                            : () => onSelectPrincipal(index, true)
                          : undefined
                      }
                      onMove={onMove}
                      onRemove={onRemove}
                    />

                    {isGalleryView ? (
                      <div className="mt-2 flex items-center justify-center gap-2">
                        {mode === "cover" || mode === "gallery" ? (
                          <button
                            type="button"
                            onClick={() => onSelectCover(item, false)}
                            className={[
                              "rounded-full px-3 py-1.5 text-[10px] font-black",
                              isCover ? "bg-fuchsia-500 text-white" : "bg-white/10 text-white/70",
                            ].join(" ")}
                          >
                            {isCover ? "*" : t("edit_use_as_cover")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelectPrincipal(index, false)}
                          className={[
                            "flex h-8 w-8 items-center justify-center rounded-full",
                            isPrincipal ? "bg-violet-500" : "bg-white/10",
                          ].join(" ")}
                          aria-label={t("edit_profile_photo")}
                        >
                          <Star size={14} fill={isPrincipal ? "white" : "none"} />
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
