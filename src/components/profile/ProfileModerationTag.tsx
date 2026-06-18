"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  tag?: string;
  className?: string;
  compact?: boolean;
};

type PopoverCoords = {
  top: number;
  left: number;
};

function canUseHover() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function ProfileModerationTag({ tag, className = "", compact = false }: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const openGuardUntilRef = useRef(0);
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

  function openPinned() {
    updateCoords();
    openGuardUntilRef.current = Date.now() + 450;
    setPinned(true);
    setHovered(false);
  }

  function togglePinned() {
    if (pinned) {
      closeAll();
      return;
    }
    openPinned();
  }

  function handleBackdropClose() {
    if (Date.now() < openGuardUntilRef.current) return;
    closeAll();
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
                className="fixed inset-0 z-[999998] cursor-default touch-manipulation bg-black/20"
                aria-label="Cerrar"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleBackdropClose();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  handleBackdropClose();
                }}
              />
            ) : null}
            <div
              role="tooltip"
              className="fixed z-[999999] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-400/25 bg-zinc-950/95 px-4 py-3 text-left shadow-2xl backdrop-blur-sm"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={canUseHover() ? reveal : undefined}
              onMouseLeave={canUseHover() ? scheduleHide : undefined}
              onPointerDown={(event) => event.stopPropagation()}
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
      <div className={["relative z-[30] touch-manipulation", className].join(" ")}>
        <button
          ref={buttonRef}
          type="button"
          onTouchEnd={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePinned();
          }}
          onClick={(event) => {
            event.stopPropagation();
            togglePinned();
          }}
          onMouseEnter={canUseHover() ? reveal : undefined}
          onMouseLeave={canUseHover() ? scheduleHide : undefined}
          className={[
            "relative z-[31] rounded-full border border-amber-400/35 bg-black/50 font-black uppercase tracking-[0.12em] text-amber-100 backdrop-blur-sm touch-manipulation",
            compact ? "px-2.5 py-1 text-[10px] tracking-[0.1em]" : "px-3 py-1.5 text-[11px]",
          ].join(" ")}
          aria-expanded={open}
        >
          {t("profile_moderation_roleplay_title")}
        </button>
      </div>
      {popover}
    </>
  );
}
