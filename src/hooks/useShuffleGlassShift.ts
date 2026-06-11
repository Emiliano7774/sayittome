"use client";

import { useEffect, useState } from "react";

function readScrollY() {
  const root = document.querySelector<HTMLElement>(
    "main[data-scroll-root].sayittome-shuffle-scroll",
  );
  if (root && root.scrollHeight > root.clientHeight + 1) {
    return root.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function countCardsBehindToolbar() {
  const toolbar = document.querySelector<HTMLElement>(".sayittome-shuffle-toolbar-glass");
  if (!toolbar) return 0;

  const zoneTop = toolbar.getBoundingClientRect().top - 96;
  const zoneBottom = toolbar.getBoundingClientRect().bottom + 12;
  let count = 0;

  document.querySelectorAll<HTMLElement>("[data-shuffle-card]").forEach((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.bottom >= zoneTop && rect.top <= zoneBottom) {
      count += 1;
    }
  });

  return count;
}

export function useShuffleGlassShift(enabled = true) {
  const [shift, setShift] = useState(220);

  useEffect(() => {
    if (!enabled) return;

    function update() {
      const y = readScrollY();
      const cardsBehind = countCardsBehindToolbar();
      const next = (220 + y * 0.42 + cardsBehind * 18) % 360;
      const lightX = 18 + (Math.sin(y * 0.018) * 0.5 + 0.5) * 64;
      const lightY = 38 + (Math.cos(y * 0.014) * 0.5 + 0.5) * 32;
      const glow = Math.min(1, 0.42 + cardsBehind * 0.12 + Math.sin(y * 0.01) * 0.08);

      setShift(next);
      document.documentElement.style.setProperty("--shuffle-glass-shift", String(next));
      document.documentElement.style.setProperty("--shuffle-glass-light-x", `${lightX}%`);
      document.documentElement.style.setProperty("--shuffle-glass-light-y", `${lightY}%`);
      document.documentElement.style.setProperty("--shuffle-glass-glow", String(glow));
    }

    let frame = 0;

    let observedGrid: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    function attachGridObserver() {
      const grid = document.querySelector<HTMLElement>("[data-shuffle-list]");
      if (!grid || grid === observedGrid) return;

      observer?.disconnect();
      observedGrid?.removeEventListener("load", scheduleUpdate, true);

      observedGrid = grid;
      observer = new MutationObserver(scheduleUpdate);
      observer.observe(grid, { childList: true, subtree: true });
      grid.addEventListener("load", scheduleUpdate, true);
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        attachGridObserver();
        update();
      });
    }

    scheduleUpdate();

    const root = document.querySelector<HTMLElement>(
      "main[data-scroll-root].sayittome-shuffle-scroll",
    );

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    root?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      root?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      observedGrid?.removeEventListener("load", scheduleUpdate, true);
      observer?.disconnect();
      document.documentElement.style.removeProperty("--shuffle-glass-shift");
      document.documentElement.style.removeProperty("--shuffle-glass-light-x");
      document.documentElement.style.removeProperty("--shuffle-glass-light-y");
      document.documentElement.style.removeProperty("--shuffle-glass-glow");
    };
  }, [enabled]);

  return shift;
}
