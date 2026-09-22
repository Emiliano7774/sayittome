"use client";

import { useEffect, useLayoutEffect } from "react";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";
import { useUxMode } from "@/contexts/UxModeContext";
import BottomNav from "@/components/navigation/BottomNav";
import ModernBottomNav from "@/components/navigation/ModernBottomNav";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { useHeldUnreadBadge } from "@/hooks/useHeldUnreadBadge";
import { isChatThreadRoute } from "@/lib/navigation/routeKind";

const HIDE_PREFIXES = ["/admin", "/login", "/register", "/privacy", "/settings/edit"];

export default function AppNavigation() {
  const { uxMode } = useUxMode();
  const pathname = useEffectivePathname();
  const { totalUnread } = useChatAlerts();
  const badgeUnread = useHeldUnreadBadge(totalUnread);

  // /chats is a main tab — never treat it as /chat/* thread (startsWith("/chat") matches /chats).
  const navHidden =
    pathname === "/" ||
    isChatThreadRoute(pathname) ||
    HIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    (uxMode === "modern" && pathname === "/shuffle");

  useLayoutEffect(() => {
    const w = window as Window & {
      __sayittomeMainTabHydrated?: boolean;
      __sayittomePrehydrateMainTabIntent?: string | null;
    };

    // React handlers are attached by the time layout effects run. Release the
    // pre-hydration guard and replay the last early tab intent through the real
    // BottomNavLink handler, which uses the same-document history fast path.
    w.__sayittomeMainTabHydrated = true;
    const pendingHref = String(w.__sayittomePrehydrateMainTabIntent || "");
    if (!pendingHref) return;

    w.__sayittomePrehydrateMainTabIntent = null;
    document.documentElement.removeAttribute(
      "data-sayittome-prehydrate-main-tab-intent",
    );

    queueMicrotask(() => {
      const tab = pendingHref.startsWith("/") ? pendingHref.slice(1) : pendingHref;
      const anchor = document.querySelector(
        `a[data-nav-tab="${tab}"][href="${pendingHref}"]`,
      );
      if (anchor instanceof HTMLElement) {
        anchor.click();
      }
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sayittome-has-bottom-nav", !navHidden);

    return () => {
      document.body.classList.remove("sayittome-has-bottom-nav");
    };
  }, [navHidden]);

  if (navHidden) {
    return null;
  }

  if (uxMode === "modern") {
    return <ModernBottomNav unreadCount={badgeUnread} />;
  }

  return <BottomNav unreadCount={badgeUnread} />;
}
