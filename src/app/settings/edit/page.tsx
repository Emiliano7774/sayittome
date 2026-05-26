"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ClassicEditProfilePage from "./components/ClassicEditProfilePage";
import ModernEditProfilePage from "./components/ModernEditProfilePage";

export default function EditProfilePage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernEditProfilePage />;
  }

  return <ClassicEditProfilePage />;
}
