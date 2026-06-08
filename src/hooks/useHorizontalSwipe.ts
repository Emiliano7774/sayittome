"use client";

import { useCallback, useRef } from "react";

type Options = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
  enabled?: boolean;
};

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 48,
  enabled = true,
}: Options) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

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

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled || !startRef.current) return;

      const touch = event.changedTouches[0];
      if (!touch) {
        startRef.current = null;
        return;
      }

      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      startRef.current = null;

      if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy)) {
        return;
      }

      swipedRef.current = true;
      if (dx < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    },
    [enabled, minDistance, onSwipeLeft, onSwipeRight],
  );

  const consumeSwipe = useCallback(() => {
    const didSwipe = swipedRef.current;
    swipedRef.current = false;
    return didSwipe;
  }, []);

  return {
    onTouchStart,
    onTouchEnd,
    consumeSwipe,
  };
}
