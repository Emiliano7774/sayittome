"use client";

import { useUxMode } from "@/contexts/UxModeContext";

import ShuffleClient from "./shuffle-client";
import ModernShuffleClient from "./modern-shuffle-client";

export default function ShufflePage() {
  const { uxMode } = useUxMode();

  if (uxMode === "modern") {
    return <ModernShuffleClient />;
  }

  return <ShuffleClient />;
}
