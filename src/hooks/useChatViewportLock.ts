"use client";

import { useEffect } from "react";

function syncChatViewportVars() {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty(
      "--sayittome-chat-vvh",
      `${window.innerHeight}px`,
    );
    document.documentElement.style.setProperty("--sayittome-chat-vv-offset-top", "0px");
    return;
  }

  document.documentElement.style.setProperty(
    "--sayittome-chat-vvh",
    `${Math.round(viewport.height)}px`,
  );
  document.documentElement.style.setProperty(
    "--sayittome-chat-vv-offset-top",
    `${Math.round(viewport.offsetTop)}px`,
  );
}

/** Undo chat viewport lock even if the chat component is still mounted off-screen. */
export function releaseChatViewportLock() {
  if (typeof window === "undefined") return;

  const { body, documentElement } = document;
  const top = body.style.top;
  const scrollY = top ? Math.abs(parseInt(top, 10)) || 0 : window.scrollY;

  body.classList.remove("sayittome-chat-open");
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  documentElement.style.removeProperty("--sayittome-chat-vvh");
  documentElement.style.removeProperty("--sayittome-chat-vv-offset-top");
  window.scrollTo(0, scrollY);
}

/** Locks the page and tracks the visible viewport while a fullscreen chat is open. */
export function useChatViewportLock(active = true) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const scrollY = window.scrollY;
    const { body, documentElement } = document;

    body.classList.add("sayittome-chat-open");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    syncChatViewportVars();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncChatViewportVars);
    viewport?.addEventListener("scroll", syncChatViewportVars);
    window.addEventListener("orientationchange", syncChatViewportVars);

    return () => {
      viewport?.removeEventListener("resize", syncChatViewportVars);
      viewport?.removeEventListener("scroll", syncChatViewportVars);
      window.removeEventListener("orientationchange", syncChatViewportVars);

      body.classList.remove("sayittome-chat-open");
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      documentElement.style.removeProperty("--sayittome-chat-vvh");
      documentElement.style.removeProperty("--sayittome-chat-vv-offset-top");

      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
