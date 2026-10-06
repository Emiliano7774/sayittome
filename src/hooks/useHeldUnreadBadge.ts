"use client";

import { useEffect, useState } from "react";

/** Rising unread waits briefly so a one-snapshot false badge never paints. */
const HOLD_UP_MS = 200;
/** Falling unread also waits — sync rebuilds briefly hit 0 and used to wipe the tick. */
const HOLD_DOWN_MS = 450;

export function useHeldUnreadBadge(count: number) {
  const [held, setHeld] = useState(0);

  useEffect(() => {
    if (count > 0) {
      if (held > 0) {
        setHeld(count);
        return;
      }
      const timer = window.setTimeout(() => setHeld(count), HOLD_UP_MS);
      return () => window.clearTimeout(timer);
    }

    if (held <= 0) return;
    const timer = window.setTimeout(() => setHeld(0), HOLD_DOWN_MS);
    return () => window.clearTimeout(timer);
  }, [count, held]);

  return held;
}
