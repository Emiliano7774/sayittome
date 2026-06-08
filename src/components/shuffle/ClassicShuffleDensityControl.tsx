"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import {
  CLASSIC_SHUFFLE_DENSITY_OPTIONS,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";
import { useT } from "@/contexts/LocaleContext";

export default function ClassicShuffleDensityControl() {
  const t = useT();
  const { density, setDensity } = useClassicShuffleDensity();

  const index = CLASSIC_SHUFFLE_DENSITY_OPTIONS.indexOf(density);

  function step(delta: -1 | 1) {
    const next = CLASSIC_SHUFFLE_DENSITY_OPTIONS[index + delta];
    if (next) setDensity(next);
  }

  return (
    <div
      className="mt-3 flex items-center justify-end gap-2 text-white/28"
      aria-label={t("shuffle_density_label")}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={index <= 0}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25"
        aria-label={t("shuffle_density_zoom_in")}
      >
        <ZoomIn size={15} />
      </button>

      <div className="flex items-center gap-1 rounded-full border border-white/8 px-1 py-1">
        {CLASSIC_SHUFFLE_DENSITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDensity(option as ClassicShuffleDensity)}
            className={[
              "min-w-[2rem] rounded-full px-2 py-1 text-[11px] font-medium transition",
              density === option
                ? "bg-white/10 text-white/72"
                : "text-white/34 hover:text-white/52",
            ].join(" ")}
            aria-label={t("shuffle_density_profiles", { count: String(option) })}
            aria-pressed={density === option}
          >
            {option}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        disabled={index >= CLASSIC_SHUFFLE_DENSITY_OPTIONS.length - 1}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25"
        aria-label={t("shuffle_density_zoom_out")}
      >
        <ZoomOut size={15} />
      </button>
    </div>
  );
}
