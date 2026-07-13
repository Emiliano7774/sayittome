"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import NavCaptureDiagOverlay from "@/components/dev/NavCaptureDiagOverlay";
import {
  attachNavCaptureDiag,
  isNavCaptureEnabled,
  registerSessionProbe,
  syncNavCaptureFromDom,
  type SessionProbeResult,
} from "@/lib/perf/navCaptureDiag";
import { attachMicroSlideActivationProbe } from "@/lib/perf/microSlideActivationProbe";
import { attachNavInputDiag } from "@/lib/perf/navInputDiag";

function detectBlockingModals() {
  if (typeof document === "undefined") return [] as string[];
  const blockers: string[] = [];
  if (document.body.classList.contains("sayittome-entry-legal-open")) {
    blockers.push("entry-legal");
  }
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(
    (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 40 && rect.height > 40 && style.visibility !== "hidden" && style.display !== "none";
    },
  );
  if (dialogs.length) blockers.push(`modal:${dialogs.length}`);
  return blockers;
}

function buildSessionProbe(
  firebaseUser: ReturnType<typeof useAuth>["firebaseUser"],
  profile: ReturnType<typeof useAuth>["profile"],
  authLoading: boolean,
): SessionProbeResult {
  const pathname = typeof location !== "undefined" ? location.pathname : "";
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const shuffleSlots =
    shuffleHost?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)")
      .length ?? 0;
  const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
  const chatsPrimary = chatsHost?.querySelector("[data-nav-chats-primary], [data-nav-primary-content]");
  const chatsRows = chatsPrimary?.querySelectorAll("a, button, [data-chat-id]").length ?? 0;
  const blockingModals = detectBlockingModals();

  const authUid = firebaseUser?.uid ?? null;
  const isAnonymous = firebaseUser?.isAnonymous ?? true;
  const username = profile?.username ?? null;

  if (authLoading) return { valid: false, reason: "auth-loading", authUid, isAnonymous, username, authLoading, pathname };
  if (!firebaseUser || isAnonymous) {
    return { valid: false, reason: "not-authenticated", authUid, isAnonymous, username, authLoading, pathname };
  }
  if (!username) {
    return { valid: false, reason: "username-missing", authUid, isAnonymous, username, authLoading, pathname };
  }
  if (blockingModals.length) {
    return {
      valid: false,
      reason: `blocking-modal:${blockingModals.join(",")}`,
      authUid,
      isAnonymous,
      username,
      authLoading,
      pathname,
      blockingModals,
    };
  }

  const shuffleVisible = shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") ?? false;
  const chatsHydrated = Boolean(chatsPrimary && !/Cargando\.\.\.|Loading\.\.\./i.test(chatsPrimary.textContent?.slice(0, 200) ?? ""));

  return {
    valid: shuffleSlots >= 3 && (shuffleVisible || pathname === "/chats"),
    reason:
      shuffleSlots < 3
        ? "shuffle-feed-not-hydrated"
        : !shuffleVisible && pathname !== "/chats"
          ? "shuffle-not-visible"
          : undefined,
    authUid,
    isAnonymous,
    username,
    authLoading,
    pathname,
    shuffleSlots,
    shuffleVisible,
    chatsHydrated,
    chatsRows,
    blockingModals,
  };
}

export default function NavCaptureDiagBootstrap() {
  const pathname = usePathname();
  const { firebaseUser, profile, loading } = useAuth();

  useEffect(() => {
    if (!isNavCaptureEnabled()) return;
    attachNavCaptureDiag();
    attachMicroSlideActivationProbe();
    attachNavInputDiag();
  }, []);

  useEffect(() => {
    if (!isNavCaptureEnabled()) return;
    registerSessionProbe(() => buildSessionProbe(firebaseUser, profile, loading));
  }, [firebaseUser, profile, loading]);

  useEffect(() => {
    if (!isNavCaptureEnabled()) return;
    syncNavCaptureFromDom(pathname);
  }, [pathname]);

  if (!isNavCaptureEnabled()) return null;

  return <NavCaptureDiagOverlay />;
}
