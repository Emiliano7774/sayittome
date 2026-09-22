"use client";

import { useEffect, useState } from "react";

/** Rising unread on the nav waits briefly so a one-snapshot false badge never paints. */
const HOLD_MS = 900;

export function useHeldUnreadBadge(count: number) {
  const [held, setHeld] = useState(0);

  useEffect(() => {
    if (count <= 0) {
      setHeld(0);
      return;
    }
    if (held > 0) {
      setHeld(count);
      return;
    }
    const timer = window.setTimeout(() => setHeld(count), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [count, held]);

  return held;
}
