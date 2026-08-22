"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  MESSAGE_LONG_PRESS_MS,
  createMessageLongPressState,
  reduceMessageLongPress,
  shouldSuppressMessageClick,
} from "@/lib/chat/messageLongPress";

type Props = {
  onLongPress: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

export default function ChatMessageLongPress({
  onLongPress,
  children,
  className,
  disabled,
}: Props) {
  const stateRef = useRef(createMessageLongPressState());
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

  function handleDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stateRef.current = reduceMessageLongPress(stateRef.current, {
      type: "down",
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    });
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      stateRef.current = reduceMessageLongPress(stateRef.current, { type: "fire" });
      if (stateRef.current.phase === "fired") onLongPress();
    }, MESSAGE_LONG_PRESS_MS);
  }

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    stateRef.current = reduceMessageLongPress(stateRef.current, {
      type: "move",
      x: event.clientX,
      y: event.clientY,
    });
    if (stateRef.current.phase === "moved") clearTimer();
  }

  function handleUp() {
    clearTimer();
    stateRef.current = reduceMessageLongPress(stateRef.current, { type: "up" });
  }

  return (
    <div
      className={className}
      onPointerDownCapture={handleDown}
      onPointerMoveCapture={handleMove}
      onPointerUpCapture={handleUp}
      onPointerCancelCapture={handleUp}
      onContextMenu={(event) => {
        if (disabled) return;
        event.preventDefault();
        stateRef.current = reduceMessageLongPress(stateRef.current, { type: "fire" });
        onLongPress();
      }}
      onClickCapture={(event) => {
        if (!shouldSuppressMessageClick(stateRef.current)) return;
        event.preventDefault();
        event.stopPropagation();
        stateRef.current = reduceMessageLongPress(stateRef.current, { type: "consume-click" });
      }}
    >
      {children}
    </div>
  );
}
