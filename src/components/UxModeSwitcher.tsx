"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";

export default function UxModeSwitcher() {
  const { uxMode, setUxMode } = useUxMode();
  const t = useT();

  const isClassic = uxMode === "classic";

  return (
    <div className="flex rounded-full border border-white/10 bg-zinc-950/90 p-1 text-xs font-semibold shadow-lg shadow-black/30 backdrop-blur">
      <button
        type="button"
        onClick={() => setUxMode("classic")}
        aria-label={t("ux_classic")}
        className={
          isClassic
            ? "rounded-full bg-white px-4 py-2 text-black transition"
            : "rounded-full px-4 py-2 text-zinc-500 transition hover:text-white"
        }
      >
        {t("ux_classic")}
      </button>

      <button
        type="button"
        onClick={() => setUxMode("modern")}
        aria-label={t("ux_modern")}
        className={
          !isClassic
            ? "rounded-full bg-white px-4 py-2 text-black transition"
            : "rounded-full px-4 py-2 text-zinc-500 transition hover:text-white"
        }
      >
        {t("ux_modern")}
      </button>
    </div>
  );
}
