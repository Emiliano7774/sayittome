"use client";

import { useRef, useState, type ReactNode } from "react";

type Props = {
  timeLabel: string;
  align: "left" | "right";
  children: ReactNode;
};

export default function ChatSwipeRevealTime({ timeLabel, align, children }: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const draggingRef = useRef(false);

  const maxReveal = 72;

  function clamp(value: number) {
    if (align === "right") {
      return Math.max(-maxReveal, Math.min(0, value));
    }
    return Math.min(maxReveal, Math.max(0, value));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = true;
    startXRef.current = event.clientX;
    startOffsetRef.current = offsetX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const delta = event.clientX - startXRef.current;
    setOffsetX(clamp(startOffsetRef.current + delta));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setOffsetX(0);
  }

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className={[
          "pointer-events-none absolute inset-y-0 flex items-center text-[11px] font-medium text-white/35",
          align === "right" ? "right-1 justify-end" : "left-1 justify-start",
        ].join(" ")}
      >
        {timeLabel}
      </div>
      <div
        className="relative touch-pan-y"
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
