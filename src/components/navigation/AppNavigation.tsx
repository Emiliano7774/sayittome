"use client";

import { useEffect } from "react";
import { useEffectivePathname } from "@/contexts/MainTabShellContext";
import { useUxMode } from "@/contexts/UxModeContext";
import BottomNav from "@/components/navigation/BottomNav";
import ModernBottomNav from "@/components/navigation/ModernBottomNav";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { isChatThreadRoute } from "@/lib/navigation/routeKind";

const HIDE_PREFIXES = ["/admin", "/login", "/register", "/privacy", "/settings/edit"];

export default function AppNavigation() {
  const { uxMode } = useUxMode();
  const pathname = useEffectivePathname();
  const { totalUnread } = useChatAlerts();

  // /chats is a main tab — never treat it as /chat/* thread (startsWith("/chat") matches /chats).
  const navHidden =
    pathname === "/" ||
    isChatThreadRoute(pathname) ||
    HIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    (uxMode === "modern" && pathname === "/shuffle");

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
    return <ModernBottomNav unreadCount={totalUnread} />;
  }

  return <BottomNav unreadCount={totalUnread} />;
}
