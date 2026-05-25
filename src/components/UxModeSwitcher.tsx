"use client";

import { useUxMode } from "@/contexts/UxModeContext";

export default function UxModeSwitcher() {
  const { uxMode, setUxMode } = useUxMode();

  const isClassic = uxMode === "classic";

  return (
    <div className="flex rounded-full border border-white/10 bg-zinc-950/90 p-1 text-xs font-black shadow-lg shadow-black/30 backdrop-blur">
      <button
        type="button"
        onClick={() => setUxMode("modern")}
        className={
          !isClassic
            ? "rounded-full bg-white px-4 py-2 text-black transition"
            : "rounded-full px-4 py-2 text-zinc-500 transition hover:text-white"
        }
      >
        Nuevo
      </button>

      <button
        type="button"
        onClick={() => setUxMode("classic")}
        className={
          isClassic
            ? "rounded-full bg-fuchsia-600 px-4 py-2 text-white shadow-lg shadow-fuchsia-600/25 transition"
            : "rounded-full px-4 py-2 text-zinc-500 transition hover:text-white"
        }
      >
        Clásico
      </button>
    </div>
  );
}
