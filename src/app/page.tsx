"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ModernHome from "@/components/modern/ModernHome";
import ClassicHome from "@/components/home/ClassicHome";
import HomeSessionRestore from "@/components/home/HomeSessionRestore";

export default function Home() {
  const { uxMode } = useUxMode();

  return (
    <HomeSessionRestore>
      {uxMode === "modern" ? <ModernHome /> : <ClassicHome />}
    </HomeSessionRestore>
  );
}
