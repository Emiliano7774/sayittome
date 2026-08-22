"use client";

import { useLayoutEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  applyChatComposerViewportVars,
  computeChatComposerViewport,
} from "@/lib/chat/chatComposerViewport";

function readSafeAreaBottom() {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--sayittome-safe-area-bottom")
    .trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom, 0px)";
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom || "0");
  probe.remove();
  return Number.isFinite(value) ? value : 0;
}

function syncChatViewportVars() {
  const inset = computeChatComposerViewport({
    innerHeight: window.innerHeight,
    visualViewport: window.visualViewport
      ? {
          height: window.visualViewport.height,
          offsetTop: window.visualViewport.offsetTop,
          offsetLeft: window.visualViewport.offsetLeft,
        }
      : null,
    safeAreaBottom: readSafeAreaBottom(),
    isNativeShell: isNativeAppShell(),
  });
  applyChatComposerViewportVars(document, inset);
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
  documentElement.style.removeProperty("--sayittome-chat-composer-pad");
  window.scrollTo(0, scrollY);
}

/** Locks the page and tracks the visible viewport while a fullscreen chat is open. */
export function useChatViewportLock(active = true) {
  useLayoutEffect(() => {
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
      documentElement.style.removeProperty("--sayittome-chat-composer-pad");

      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
