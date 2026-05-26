"use client";

import { usePathname } from "next/navigation";

import { useUxMode } from "@/contexts/UxModeContext";
import BottomNav from "@/components/navigation/BottomNav";
import ModernBottomNav from "@/components/navigation/ModernBottomNav";

const HIDE_PREFIXES = ["/admin", "/login"];

export default function AppNavigation() {
  const { uxMode } = useUxMode();
  const pathname = usePathname();

  if (HIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  if (uxMode === "modern") {
    return <ModernBottomNav />;
  }

  return <BottomNav />;
}
