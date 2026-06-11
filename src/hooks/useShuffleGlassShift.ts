"use client";

import { useEffect, useState } from "react";

export function useShuffleGlassShift(enabled = true) {
  const [shift, setShift] = useState(220);

  useEffect(() => {
    if (!enabled) return;

    function readScrollY() {
      const root = document.querySelector<HTMLElement>(
        "main[data-scroll-root].sayittome-shuffle-scroll",
      );
      if (root && root.scrollHeight > root.clientHeight + 1) {
        return root.scrollTop;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function update() {
      const y = readScrollY();
      const next = (220 + y * 0.42) % 360;
      setShift(next);
      document.documentElement.style.setProperty("--shuffle-glass-shift", String(next));
    }

    update();

    const root = document.querySelector<HTMLElement>(
      "main[data-scroll-root].sayittome-shuffle-scroll",
    );

    window.addEventListener("scroll", update, { passive: true });
    root?.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("scroll", update);
      root?.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--shuffle-glass-shift");
    };
  }, [enabled]);

  return shift;
}
