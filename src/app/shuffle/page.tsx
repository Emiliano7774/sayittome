"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import ShuffleLegalGate from "@/components/legal/ShuffleLegalGate";

import ShuffleClient from "./shuffle-client";
import ModernShuffleClient from "./modern-shuffle-client";

export default function ShufflePage() {
  const { uxMode } = useUxMode();

  return (
    <ShuffleLegalGate>
      {uxMode === "modern" ? <ModernShuffleClient /> : <ShuffleClient />}
    </ShuffleLegalGate>
  );
}
