"use client";

import { Heart, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import { loadStoryViewers } from "@/lib/stories/storyViewerRecords";
import { shouldCloseStoryViewersGesture } from "@/lib/stories/storyViewersGesture";
import { looksLikeAnonymousStoryViewer, type StoryViewerRow } from "@/lib/stories/storyViewers";
import type { StoryItem } from "@/lib/stories/types";

type Props = {
  open: boolean;
  story: StoryItem | null;
  onClose: () => void;
  onOpenProfile: (username: string) => void;
  onOpenChat: (username: string) => void;
};

export default function StoryViewersSheet({
  open,
  story,
  onClose,
  onOpenProfile,
  onOpenChat,
}: Props) {
  const t = useT();
  const [rows, setRows] = useState<StoryViewerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    y: 0,
    x: 0,
    t: 0,
    active: false,
    locked: false,
    fromList: false,
  });

  useEffect(() => {
    if (!open || !story?.id) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadStoryViewers(story)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, story]);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
      dragRef.current.active = false;
      dragRef.current.locked = false;
    }
  }, [open]);

  function beginDrag(event: React.PointerEvent, fromList = false) {
    const scrollTop = fromList ? Math.max(0, scrollRef.current?.scrollTop || 0) : 0;
    dragRef.current = {
      y: event.clientY,
      x: event.clientX,
      t: Date.now(),
      active: !fromList || scrollTop <= 2,
      locked: !fromList,
      fromList,
    };
    if (!fromList) {
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  }

  function moveDrag(event: React.PointerEvent) {
    if (!dragRef.current.active) return;
    const deltaDown = event.clientY - dragRef.current.y;
    const absX = Math.abs(event.clientX - dragRef.current.x);
    if (dragRef.current.fromList && !dragRef.current.locked) {
      const scrollTop = Math.max(0, scrollRef.current?.scrollTop || 0);
      if (scrollTop > 2 || deltaDown < -8) {
        dragRef.current.active = false;
        return;
      }
      if (deltaDown > 8 && deltaDown > absX) {
        dragRef.current.locked = true;
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else {
        return;
      }
    }
    if (dragRef.current.locked) {
      setDragY(Math.max(0, deltaDown));
    }
  }

  function endDrag(event: React.PointerEvent) {
    if (!dragRef.current.active && !dragRef.current.locked) return;
    const deltaDown = Math.max(0, event.clientY - dragRef.current.y);
    const absX = Math.abs(event.clientX - dragRef.current.x);
    const elapsedMs = Math.max(1, Date.now() - dragRef.current.t);
    const scrollTop = dragRef.current.fromList
      ? Math.max(0, scrollRef.current?.scrollTop || 0)
      : 0;
    const locked = dragRef.current.locked;
    dragRef.current.active = false;
    dragRef.current.locked = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (
      locked &&
      shouldCloseStoryViewersGesture({
        deltaDown,
        absX,
        elapsedMs,
        scrollTop,
      })
    ) {
      setDragY(0);
      onClose();
      return;
    }
    setDragY(0);
  }

  if (!open) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 top-[38dvh] z-[80] flex flex-col rounded-t-[1.75rem] border-t border-white/10 bg-zinc-950/96 shadow-[0_-18px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      data-story-viewers-sheet="1"
      style={{
        transform: `translate3d(0, ${dragY}px, 0)`,
        transition: dragging ? "none" : "transform 160ms ease-out",
      }}
    >
      <div
        className="flex min-h-[4.75rem] shrink-0 touch-none flex-col items-center px-4 pb-2 pt-3"
        onPointerDown={(event) => beginDrag(event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-story-viewers-handle="1"
      >
        <button
          type="button"
          className="flex w-full flex-col items-center"
          onClick={onClose}
          aria-label={t("common_cancel")}
        >
          <span className="mb-3 h-1.5 w-16 rounded-full bg-white/40" />
          <span className="w-full text-left text-sm font-black text-white">
            {t("story_viewers_title")}
            <span className="ml-2 text-white/40">{rows.length || story?.viewCount || 0}</span>
          </span>
        </button>
      </div>

      <div
        ref={scrollRef}
        data-story-viewers-scroll="1"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onPointerDown={(event) => beginDrag(event, true)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {loading && rows.length === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-white/45">{t("common_loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-white/45">{t("story_viewers_empty")}</p>
        ) : (
          rows.map((row) => {
            const profileName = row.username;
            const anonymous =
              row.kind === "anon" ||
              looksLikeAnonymousStoryViewer(row.id) ||
              looksLikeAnonymousStoryViewer(profileName);
            const label = anonymous ? t("stories_anonymous_viewer") : `@${profileName}`;
            return (
              <div
                key={row.id}
                data-story-viewer-row={row.kind}
                data-story-viewer-liked={row.liked ? "1" : "0"}
                className="flex min-h-12 items-center gap-3 rounded-2xl px-1 py-1.5"
              >
                {!anonymous && profileName ? (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(profileName)}
                    className="shrink-0"
                    aria-label={t("stories_view_profile", { username: profileName })}
                  >
                    {row.photo ? (
                      <img src={row.photo} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                        <UserRound size={20} />
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
                    <UserRound size={20} />
                  </span>
                )}

                {!anonymous && profileName ? (
                  <button
                    type="button"
                    onClick={() => onOpenChat(profileName)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-black text-white">{label}</span>
                    {row.liked ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-[#E879F9]">
                        {t("story_viewers_liked")}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{label}</p>
                    {row.liked ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-[#E879F9]">{t("story_viewers_liked")}</p>
                    ) : null}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-2 pl-2">
                  {row.liked ? <Heart size={16} className="text-[#E879F9]" fill="currentColor" /> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
