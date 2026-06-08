"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import {
  CLASSIC_SHUFFLE_DENSITY_OPTIONS,
  getClassicShuffleDensityTokens,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  className?: string;
};

export default function ClassicShuffleDensityControl({ className = "mt-3" }: Props) {
  const t = useT();
  const { density, setDensity } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);

  const index = CLASSIC_SHUFFLE_DENSITY_OPTIONS.indexOf(density);

  function step(delta: -1 | 1) {
    const next = CLASSIC_SHUFFLE_DENSITY_OPTIONS[index + delta];
    if (next) setDensity(next);
  }

  return (
    <div
      className={`flex items-center justify-end ${tokens.densityGap} text-white/35 ${className}`}
      aria-label={t("shuffle_density_label")}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={index <= 0}
        className={`flex ${tokens.densityZoomBtn} items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25`}
        aria-label={t("shuffle_density_zoom_in")}
      >
        <ZoomIn size={tokens.densityZoomIcon} />
      </button>

      <div className={`flex items-center gap-1 rounded-full border border-white/8 px-1 py-1 ${tokens.densityBtnText}`}>
        {CLASSIC_SHUFFLE_DENSITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDensity(option as ClassicShuffleDensity)}
            className={[
              "min-w-[2rem] rounded-full px-2 py-1 font-medium transition",
              density === option
                ? "bg-white/10 text-white/80"
                : "text-white/38 hover:text-white/55",
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
        className={`flex ${tokens.densityZoomBtn} items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25`}
        aria-label={t("shuffle_density_zoom_out")}
      >
        <ZoomOut size={tokens.densityZoomIcon} />
      </button>
    </div>
  );
}
