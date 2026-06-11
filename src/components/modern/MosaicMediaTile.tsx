"use client";

import { Camera, ChevronLeft, ChevronRight, Film, Trash2 } from "lucide-react";

import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useT } from "@/contexts/LocaleContext";

import type { EditMediaItem } from "@/components/modern/ModernEditMediaSheet";

type Props = {
  item: EditMediaItem;
  index: number;
  total: number;
  isCover: boolean;
  isPrincipal: boolean;
  showCoverBadge: boolean;
  showPrincipalBadge: boolean;
  tapToSelect: boolean;
  onTap?: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
};

export default function MosaicMediaTile({
  item,
  index,
  total,
  isCover,
  isPrincipal,
  showCoverBadge,
  showPrincipalBadge,
  tapToSelect,
  onTap,
  onMove,
  onRemove,
}: Props) {
  const t = useT();

  const swipe = useHorizontalSwipe({
    enabled: total > 1,
    onSwipeLeft: () => onMove(index, 1),
    onSwipeRight: () => onMove(index, -1),
  });

  const tileClassName = [
    "relative aspect-square overflow-hidden rounded-[1.35rem] border bg-zinc-950",
    isCover && showCoverBadge
      ? "border-fuchsia-400 ring-2 ring-fuchsia-400/60"
      : isPrincipal && showPrincipalBadge
        ? "border-violet-400 ring-2 ring-violet-400/60"
        : "border-white/10",
  ].join(" ");

  return (
    <div className={tileClassName}>
      {tapToSelect && onTap ? (
        <button
          type="button"
          onClick={() => {
            if (swipe.consumeSwipe()) return;
            onTap();
          }}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          className={`absolute inset-0 z-[1] appearance-none border-0 bg-transparent p-0 ${swipe.touchActionClass}`}
          aria-label={t("edit_mosaic_title")}
        />
      ) : (
        <div
          className={`absolute inset-0 z-[1] ${swipe.touchActionClass}`}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        />
      )}

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

      {showPrincipalBadge && isPrincipal ? (
        <span className="pointer-events-none absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-sm font-black text-white">
          ★
        </span>
      ) : null}

      {showCoverBadge && isCover ? (
        <span
          className={[
            "pointer-events-none absolute top-2 flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500 text-sm font-black text-white",
            showPrincipalBadge && isPrincipal ? "right-11" : "right-2",
          ].join(" ")}
        >
          *
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center justify-between gap-1 bg-gradient-to-t from-black via-black/75 to-transparent p-2">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 disabled:opacity-25"
          aria-label={t("edit_move_earlier")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/80"
          aria-label={t("edit_remove_media")}
        >
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index >= total - 1}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 disabled:opacity-25"
          aria-label={t("edit_move_later")}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
