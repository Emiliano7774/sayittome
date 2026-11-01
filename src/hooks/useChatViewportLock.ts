"use client";

import { useLayoutEffect } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  applyChatComposerViewportVars,
  computeChatComposerViewport,
} from "@/lib/chat/chatComposerViewport";

let cachedSafeAreaBottom = 0;
let cachedSafeAreaAt = 0;

function readSafeAreaBottom() {
  if (typeof window === "undefined") return 0;
  // visualViewport resize/scroll fires many times during IME animation.
  // Re-probing the DOM on every event forces layout and fights the keyboard.
  const now = Date.now();
  if (now - cachedSafeAreaAt < 1500) return cachedSafeAreaBottom;

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--sayittome-safe-area-bottom")
    .trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    cachedSafeAreaBottom = parsed;
    cachedSafeAreaAt = now;
    return parsed;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom, 0px)";
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom || "0");
  probe.remove();
  cachedSafeAreaBottom = Number.isFinite(value) ? value : 0;
  cachedSafeAreaAt = now;
  return cachedSafeAreaBottom;
}

function syncChatViewportVars() {
  if (typeof document !== "undefined" && document.hidden) return;
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
  body.style.overflow = "";
  documentElement.style.overflow = "";
  documentElement.style.removeProperty("--sayittome-chat-vvh");
  documentElement.style.removeProperty("--sayittome-chat-vv-offset-top");
  documentElement.style.removeProperty("--sayittome-chat-composer-pad");
  // On native Android the document was never position:fixed. Restoring window
  // scroll here can move the active surface while the chat/IME is closing.
  if (!isNativeAppShell()) window.scrollTo(0, scrollY);
}

/**
 * Tracks visualViewport CSS vars while a fullscreen chat is open.
 *
 * On Capacitor/Android WebView, body { position:fixed } fights the system IME
 * (keyboard open/close thrash + delayed taps). Native shell only blocks page
 * scroll via overflow:hidden and relies on adjustResize + CSS vars.
 */
export function useChatViewportLock(active = true) {
  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;

    const scrollY = window.scrollY;
    const { body, documentElement } = document;
    const nativeShell = isNativeAppShell();

    body.classList.add("sayittome-chat-open");

    if (nativeShell) {
      body.style.overflow = "hidden";
      documentElement.style.overflow = "hidden";
    } else {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }

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
      body.style.overflow = "";
      documentElement.style.overflow = "";
      documentElement.style.removeProperty("--sayittome-chat-vvh");
      documentElement.style.removeProperty("--sayittome-chat-vv-offset-top");
      documentElement.style.removeProperty("--sayittome-chat-composer-pad");

      if (!nativeShell) {
        window.scrollTo(0, scrollY);
      }
    };
  }, [active]);
}
