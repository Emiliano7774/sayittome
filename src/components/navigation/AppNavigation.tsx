"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useUxMode } from "@/contexts/UxModeContext";
import BottomNav from "@/components/navigation/BottomNav";
import ModernBottomNav from "@/components/navigation/ModernBottomNav";

const HIDE_PREFIXES = ["/admin", "/login", "/register"];

export default function AppNavigation() {
  const { uxMode } = useUxMode();
  const pathname = usePathname();

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
    return <ModernBottomNav />;
  }

  return <BottomNav />;
}
