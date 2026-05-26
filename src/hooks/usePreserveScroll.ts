"use client";

import { useEffect, useRef } from "react";

export function usePreserveScroll(key: string) {
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;

    restored.current = true;

    const saved = sessionStorage.getItem(key);

    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(saved));
      });
    }

    const onScroll = () => {
      sessionStorage.setItem(
        key,
        String(window.scrollY)
      );
    };

    window.addEventListener("scroll", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [key]);
}
