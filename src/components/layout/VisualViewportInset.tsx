"use client";

import { useEffect } from "react";

import {
  readBrowserChromeBottomPx,
  syncShuffleListClearance,
} from "@/lib/shuffle/shuffleSearchViewport";

function readBrowserChromeBottom() {
  return readBrowserChromeBottomPx();
}

/** Keeps fixed bottom UI aligned with the visible viewport on mobile browsers. */
export default function VisualViewportInset() {
  useEffect(() => {
    function sync() {
      if (document.body.classList.contains("sayittome-chat-open")) {
        document.documentElement.style.setProperty(
          "--sayittome-browser-chrome-bottom",
          "0px",
        );
        return;
      }

      document.documentElement.style.setProperty(
        "--sayittome-browser-chrome-bottom",
        `${readBrowserChromeBottom()}px`,
      );
      syncShuffleListClearance();
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
