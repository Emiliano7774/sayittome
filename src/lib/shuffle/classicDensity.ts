export const CLASSIC_SHUFFLE_DENSITY_OPTIONS = [5, 10, 20, 30] as const;

export type ClassicShuffleDensity =
  (typeof CLASSIC_SHUFFLE_DENSITY_OPTIONS)[number];

const STORAGE_KEY = "sayittome_classic_shuffle_density";

export type ClassicShuffleDensityStyle = {
  rowPadding: string;
  avatarSize: "sm" | "md";
  iconSize: number;
  nameClass: string;
  bioClass: string;
  gapClass: string;
};

const DENSITY_STYLES: Record<ClassicShuffleDensity, ClassicShuffleDensityStyle> =
  {
    5: {
      rowPadding: "py-5",
      avatarSize: "md",
      iconSize: 28,
      nameClass: "text-xl font-medium text-white/92",
      bioClass: "text-sm font-normal text-white/42",
      gapClass: "gap-4",
    },
    10: {
      rowPadding: "py-3.5",
      avatarSize: "sm",
      iconSize: 24,
      nameClass: "text-lg font-medium text-white/88",
      bioClass: "text-xs font-normal text-white/38",
      gapClass: "gap-3.5",
    },
    20: {
      rowPadding: "py-2.5",
      avatarSize: "sm",
      iconSize: 20,
      nameClass: "text-base font-normal text-white/84",
      bioClass: "text-xs font-normal text-white/34 line-clamp-1",
      gapClass: "gap-3",
    },
    30: {
      rowPadding: "py-1.5",
      avatarSize: "sm",
      iconSize: 18,
      nameClass: "text-sm font-normal text-white/80",
      bioClass: "text-[11px] font-normal text-white/30 line-clamp-1",
      gapClass: "gap-2.5",
    },
  };

export function isClassicShuffleDensity(
  value: number,
): value is ClassicShuffleDensity {
  return CLASSIC_SHUFFLE_DENSITY_OPTIONS.includes(
    value as ClassicShuffleDensity,
  );
}

export function readClassicShuffleDensity(): ClassicShuffleDensity {
  if (typeof window === "undefined") return 10;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = Number(raw);
  return isClassicShuffleDensity(parsed) ? parsed : 10;
}

export function writeClassicShuffleDensity(value: ClassicShuffleDensity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

export function getClassicShuffleDensityStyle(
  density: ClassicShuffleDensity,
): ClassicShuffleDensityStyle {
  return DENSITY_STYLES[density];
}
