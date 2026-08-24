"use client";

import { useRef, useState, type ReactNode } from "react";

type Props = {
  timeLabel: string;
  align: "left" | "right";
  /** Swipe left past threshold → quote/reply (any message). */
  onSwipeLeftReply?: () => void;
  children: ReactNode;
};

const REPLY_THRESHOLD = 56;
const MAX_REVEAL = 72;

export default function ChatSwipeRevealTime({
  timeLabel,
  align,
  onSwipeLeftReply,
  children,
}: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const axisRef = useRef<"none" | "x" | "y">("none");
  const triggeredReplyRef = useRef(false);

  const revealTime = Math.abs(offsetX) >= 10 && Boolean(timeLabel);
  const timeOffset =
    align === "right" ? MAX_REVEAL + Math.min(0, offsetX) : -MAX_REVEAL + Math.max(0, offsetX);

  function clamp(value: number) {
    // Allow left swipe (negative) for reply on every bubble; right reveals time for peers.
    return Math.max(-MAX_REVEAL, Math.min(MAX_REVEAL, value));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = true;
    triggeredReplyRef.current = false;
    axisRef.current = "none";
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startOffsetRef.current = offsetX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;

    if (axisRef.current === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (axisRef.current === "y") return;
    }
    if (axisRef.current !== "x") return;

    setOffsetX(clamp(startOffsetRef.current + dx));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalOffset = offsetX;
    const shouldReply =
      Boolean(onSwipeLeftReply) &&
      axisRef.current === "x" &&
      finalOffset <= -REPLY_THRESHOLD &&
      !triggeredReplyRef.current;

    axisRef.current = "none";
    setOffsetX(0);

    if (shouldReply) {
      triggeredReplyRef.current = true;
      onSwipeLeftReply?.();
    }
  }

  return (
    <div
      className={[
        "relative max-w-full overflow-hidden",
        align === "right" ? "self-end" : "self-start",
      ].join(" ")}
    >
      {timeLabel ? (
        <div
          className={[
            "pointer-events-none absolute inset-y-0 z-0 flex items-center whitespace-nowrap text-[11px] font-medium text-white/35",
            align === "right" ? "right-0 justify-end pr-1" : "left-0 justify-start pl-1",
            revealTime && offsetX > 0 ? "opacity-100" : "opacity-0",
          ].join(" ")}
          style={{
            transform: `translateX(${timeOffset}px)`,
            transition: draggingRef.current
              ? "none"
              : "transform 160ms ease-out, opacity 100ms ease-out",
          }}
          aria-hidden={!revealTime}
        >
          {timeLabel}
        </div>
      ) : null}
      <div
        className={[
          "pointer-events-none absolute inset-y-0 right-0 z-0 flex items-center pr-2 text-[11px] font-semibold text-violet-300/80",
          offsetX <= -24 ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden={offsetX > -24}
      >
        Responder
      </div>
      <div
        className="relative z-10 touch-pan-y"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: draggingRef.current ? "none" : "transform 160ms ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
    </div>
  );
}
