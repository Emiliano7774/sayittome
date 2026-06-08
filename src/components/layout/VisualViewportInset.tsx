"use client";

import { useEffect } from "react";

function readBrowserChromeBottom() {
  if (typeof window === "undefined") {
    return 0;
  }

  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }

  const inset = window.innerHeight - viewport.height - viewport.offsetTop;
  return Math.max(0, Math.round(inset));
}

/** Keeps fixed bottom UI aligned with the visible viewport on mobile browsers. */
export default function VisualViewportInset() {
  useEffect(() => {
    function sync() {
      document.documentElement.style.setProperty(
        "--sayittome-browser-chrome-bottom",
        `${readBrowserChromeBottom()}px`,
      );
    }

    sync();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.documentElement.style.removeProperty("--sayittome-browser-chrome-bottom");
    };
  }, []);

  return null;
}
