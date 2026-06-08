import {
  getClassicShuffleDensityTokens,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";

export function getClassicProfileScale(density: ClassicShuffleDensity) {
  return getClassicShuffleDensityTokens(density).scale;
}

export function classicProfileScaleStyle(density: ClassicShuffleDensity) {
  const scale = getClassicProfileScale(density);

  return {
    transform: `scale(${scale})`,
    transformOrigin: "top center",
    width: `${100 / scale}%`,
    marginInline: "auto",
  } as const;
}
