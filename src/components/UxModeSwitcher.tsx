"use client";

import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  className?: string;
};

export default function UxModeSwitcher({ className = "" }: Props) {
  const { uxMode, setUxMode } = useUxMode();
  const t = useT();

  const isClassic = uxMode === "classic";

  return (
    <div
      className={`inline-flex max-w-full shrink-0 rounded-full border border-white/10 bg-zinc-950/90 p-0.5 text-[10px] font-semibold shadow-lg shadow-black/30 backdrop-blur sm:p-1 sm:text-xs ${className}`}
      role="group"
      aria-label={t("ux_classic")}
    >
      <button
        type="button"
        onClick={() => setUxMode("classic")}
        aria-label={t("ux_classic")}
        aria-pressed={isClassic}
        className={
          isClassic
            ? "rounded-full bg-white px-2.5 py-1.5 text-black transition sm:px-4 sm:py-2"
            : "rounded-full px-2.5 py-1.5 text-zinc-500 transition hover:text-white sm:px-4 sm:py-2"
        }
      >
        <span className="sm:hidden">{t("ux_classic_short")}</span>
        <span className="hidden sm:inline">{t("ux_classic")}</span>
      </button>

      <button
        type="button"
        onClick={() => setUxMode("modern")}
        aria-label={t("ux_modern")}
        aria-pressed={!isClassic}
        className={
          !isClassic
            ? "rounded-full bg-white px-2.5 py-1.5 text-black transition sm:px-4 sm:py-2"
            : "rounded-full px-2.5 py-1.5 text-zinc-500 transition hover:text-white sm:px-4 sm:py-2"
        }
      >
        <span className="sm:hidden">{t("ux_modern_short")}</span>
        <span className="hidden sm:inline">{t("ux_modern")}</span>
      </button>
    </div>
  );
}
