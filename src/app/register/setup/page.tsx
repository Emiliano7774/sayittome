"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ClassicProfileSetup from "@/components/register/ClassicProfileSetup";
import ModernProfileSetup from "@/components/register/ModernProfileSetup";

export default function ProfileSetupPage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernProfileSetup />;
  }

  return <ClassicProfileSetup />;
}
