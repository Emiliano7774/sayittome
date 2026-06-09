"use client";

import ClassicBoostPage from "@/components/boost/ClassicBoostPage";
import ModernBoostPage from "@/components/boost/ModernBoostPage";
import { useUxMode } from "@/contexts/UxModeContext";

export default function BoostPage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernBoostPage />;
  }

  return <ClassicBoostPage />;
}
