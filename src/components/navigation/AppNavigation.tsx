"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useUxMode } from "@/contexts/UxModeContext";
import BottomNav from "@/components/navigation/BottomNav";
import ModernBottomNav from "@/components/navigation/ModernBottomNav";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";

const HIDE_PREFIXES = ["/admin", "/login", "/register"];

export default function AppNavigation() {
  const { uxMode } = useUxMode();
  const pathname = usePathname();
  const { totalUnread } = useChatAlerts();

  const navHidden =
    pathname === "/" ||
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
