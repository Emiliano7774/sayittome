"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ModernHome from "@/components/modern/ModernHome";
import ClassicHome from "@/components/home/ClassicHome";

export default function Home() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernHome />;
  }

  return <ClassicHome />;
}
