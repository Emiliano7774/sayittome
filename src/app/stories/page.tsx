"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ModernStoriesPage from "@/components/modern/ModernStoriesPage";
import ClassicStoriesPage from "./classic-stories-page";

export default function StoriesPage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernStoriesPage />;
  }

  return <ClassicStoriesPage />;
}
