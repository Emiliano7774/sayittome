"use client";

import { useCallback, useRef } from "react";

type Options = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
  enabled?: boolean;
};

type Point = { x: number; y: number };

function resolveSwipe(
  start: Point,
  end: Point,
  minDistance: number,
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < minDistance) return false;

  // Allow mildly diagonal swipes; reject only clearly vertical gestures.
  if (Math.abs(dy) > Math.abs(dx) * 1.35) return false;

  if (dx < 0) {
    onSwipeLeft?.();
  } else {
    onSwipeRight?.();
  }

  return true;
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 40,
  enabled = true,
}: Options) {
  const startRef = useRef<Point | null>(null);
  const swipedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const resetGesture = useCallback(() => {
    startRef.current = null;
    activePointerIdRef.current = null;
  }, []);

  const completeGesture = useCallback(
    (end: Point) => {
      const start = startRef.current;
      resetGesture();
      if (!enabled || !start) return;

      const didSwipe = resolveSwipe(start, end, minDistance, onSwipeLeft, onSwipeRight);
      if (didSwipe) {
        swipedRef.current = true;
      }
    },
    [enabled, minDistance, onSwipeLeft, onSwipeRight, resetGesture],
  );

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled) return;
      swipedRef.current = false;
      const touch = event.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled],
  );

  const onTouchMove = useCallback(() => {
    // Decide swipe direction on release only so small vertical jitter does not cancel it.
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled || !startRef.current) return;

      const touch = event.changedTouches[0];
      if (!touch) {
        resetGesture();
        return;
      }

      completeGesture({ x: touch.clientX, y: touch.clientY });
    },
    [completeGesture, enabled, resetGesture],
  );

  const onTouchCancel = useCallback(() => {
    resetGesture();
  }, [resetGesture]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.pointerType === "mouse") return;
      swipedRef.current = false;
      activePointerIdRef.current = event.pointerId;
      startRef.current = { x: event.clientX, y: event.clientY };
    },
    [enabled],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || activePointerIdRef.current !== event.pointerId) return;
      completeGesture({ x: event.clientX, y: event.clientY });
    },
    [completeGesture, enabled],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      resetGesture();
    },
    [resetGesture],
  );

  const consumeSwipe = useCallback(() => {
    const didSwipe = swipedRef.current;
    swipedRef.current = false;
    return didSwipe;
  }, []);

  const bind = useCallback(
    () => ({
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
    }),
    [
      onPointerCancel,
      onPointerDown,
      onPointerUp,
      onTouchCancel,
      onTouchEnd,
      onTouchMove,
      onTouchStart,
    ],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    bind,
    consumeSwipe,
    touchActionClass: "touch-pan-y",
  };
}
