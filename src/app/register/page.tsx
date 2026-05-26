"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ClassicRegisterPage from "@/components/register/ClassicRegisterPage";
import ModernRegisterPage from "@/components/register/ModernRegisterPage";

export default function RegisterPage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernRegisterPage />;
  }

  return <ClassicRegisterPage />;
}
