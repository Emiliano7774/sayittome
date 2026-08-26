"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

type TagKind = "roleplay" | "fake";

function canUseHover() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function resolveTagKind(tag?: string): TagKind | null {
  const value = String(tag || "").trim().toLowerCase();
  if (value === "roleplay") return "roleplay";
  if (value === "fake") return "fake";
  return null;
}

function subscribeNever() {
  return () => {};
}

export default function ProfileModerationTag({ tag, className = "", compact = false }: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const openGuardUntilRef = useRef(0);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0 });

  const kind = resolveTagKind(tag);
  const open = pinned || hovered;

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

  if (!kind) return null;

  const isFake = kind === "fake";
  const title = isFake
    ? t("profile_moderation_fake_title")
    : t("profile_moderation_roleplay_title");
  const hint = isFake
    ? t("profile_moderation_fake_hint")
    : t("profile_moderation_roleplay_hint");
  const shellClass = isFake
    ? "border-rose-400/40 bg-black/50 text-rose-100"
    : "border-amber-400/35 bg-black/50 text-amber-100";
  const popoverClass = isFake
    ? "border-rose-400/30 bg-zinc-950/95 text-rose-100/90"
    : "border-amber-400/25 bg-zinc-950/95 text-amber-100/85";

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
              className={[
                "fixed z-[999999] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border px-4 py-3 text-left shadow-2xl backdrop-blur-sm",
                popoverClass,
              ].join(" ")}
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={canUseHover() ? reveal : undefined}
              onMouseLeave={canUseHover() ? scheduleHide : undefined}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <p className="text-xs font-semibold leading-snug">{hint}</p>
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
            "relative z-[31] rounded-full border font-black uppercase tracking-[0.12em] backdrop-blur-sm touch-manipulation",
            shellClass,
            compact ? "px-2.5 py-1 text-[10px] tracking-[0.1em]" : "px-3 py-1.5 text-[11px]",
          ].join(" ")}
          aria-expanded={open}
          aria-label={title}
        >
          {title}
        </button>
      </div>
      {popover}
    </>
  );
}
