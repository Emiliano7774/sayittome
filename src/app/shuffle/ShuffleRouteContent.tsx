"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ShuffleLegalGate from "@/components/legal/ShuffleLegalGate";

import ShuffleClient from "./shuffle-client";
import ModernShuffleClient from "./modern-shuffle-client";

export default function ShuffleRouteContent() {
  const { uxMode } = useUxMode();
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("qaDebug") === "1" &&
    new URLSearchParams(window.location.search).get("qaShuffleThrow") === "1"
  ) {
    throw new Error("qaDebug synthetic Shuffle boundary test");
  }

  return (
    <ShuffleLegalGate>
      {uxMode === "modern" ? <ModernShuffleClient /> : <ShuffleClient />}
    </ShuffleLegalGate>
  );
}
