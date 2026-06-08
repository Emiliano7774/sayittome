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

export default function ClassicShuffleDensityControl({ className = "" }: Props) {
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
      className={`flex items-center justify-end text-white/28 ${tokens.densityGap} ${className}`}
      aria-label={t("shuffle_density_label")}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={index <= 0}
        className={`flex items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25 ${tokens.densityZoomBtn}`}
        aria-label={t("shuffle_density_zoom_in")}
      >
        <ZoomIn size={tokens.densityZoomIcon} />
      </button>

      <div
        className={`flex items-center rounded-full border border-white/8 ${tokens.densityGap} ${tokens.densityTrackPad}`}
      >
        {CLASSIC_SHUFFLE_DENSITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDensity(option as ClassicShuffleDensity)}
            className={[
              "rounded-full font-medium transition",
              tokens.densityNumText,
              tokens.densityNumMinW,
              tokens.densityNumPad,
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
        className={`flex items-center justify-center rounded-full border border-white/8 transition active:scale-95 disabled:opacity-25 ${tokens.densityZoomBtn}`}
        aria-label={t("shuffle_density_zoom_out")}
      >
        <ZoomOut size={tokens.densityZoomIcon} />
      </button>
    </div>
  );
}
