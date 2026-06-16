"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  tag?: string;
  className?: string;
};

type PopoverCoords = {
  top: number;
  left: number;
};

function canUseHover() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function ProfileModerationTag({ tag, className = "" }: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0 });

  const open = pinned || hovered;

  useEffect(() => {
    setMounted(true);
  }, []);

  function clearHideTimer() {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function updateCoords() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);

    setCoords({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    });
  }

  function reveal() {
    clearHideTimer();
    updateCoords();
    setHovered(true);
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 120);
  }

  function closeAll() {
    clearHideTimer();
    setPinned(false);
    setHovered(false);
  }

  useEffect(() => {
    if (!open) return;

    updateCoords();

    const onMove = () => updateCoords();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);

    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  useEffect(() => () => clearHideTimer(), []);

  if (tag !== "roleplay") return null;

  const popover =
    open && mounted
      ? createPortal(
          <>
            {pinned ? (
              <button
                type="button"
                className="fixed inset-0 z-[999998] cursor-default bg-transparent"
                aria-label="Cerrar"
                onClick={closeAll}
              />
            ) : null}
            <div
              role="tooltip"
              className="fixed z-[999999] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-400/25 bg-zinc-950/95 px-4 py-3 text-left shadow-2xl backdrop-blur-sm"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={canUseHover() ? reveal : undefined}
              onMouseLeave={canUseHover() ? scheduleHide : undefined}
            >
              <p className="text-xs font-semibold leading-snug text-amber-100/85">
                {t("profile_moderation_roleplay_hint")}
              </p>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={className}>
        <button
          ref={buttonRef}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            updateCoords();
            setPinned((value) => !value);
            setHovered(false);
          }}
          onMouseEnter={canUseHover() ? reveal : undefined}
          onMouseLeave={canUseHover() ? scheduleHide : undefined}
          onTouchStart={(event) => event.stopPropagation()}
          className="rounded-full border border-amber-400/35 bg-black/50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100 backdrop-blur-sm"
          aria-expanded={open}
        >
          {t("profile_moderation_roleplay_title")}
        </button>
      </div>
      {popover}
    </>
  );
}
