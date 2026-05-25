"use client";

import { useUxMode } from "@/contexts/UxModeContext";

export default function PublicUxSwitcher() {
  const { uxMode, toggleUxMode } = useUxMode();

  return (
    <button
      onClick={toggleUxMode}
      className="
        fixed
        right-4
        top-4
        z-[99999]
        rounded-full
        border
        border-white/15
        bg-black/70
        px-4
        py-2
        text-xs
        font-black
        text-white
        shadow-[0_0_30px_rgba(124,92,255,.35)]
        backdrop-blur-xl
        active:scale-95
      "
    >
      {uxMode === "classic" ? "CLASSIC" : "MODERN"}
    </button>
  );
}
