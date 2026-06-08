export const CLASSIC_SHUFFLE_DENSITY_OPTIONS = [5, 10, 20, 30, 40, 50] as const;

export type ClassicShuffleDensity =
  (typeof CLASSIC_SHUFFLE_DENSITY_OPTIONS)[number];

const STORAGE_KEY = "sayittome_classic_shuffle_density";

export type ClassicShuffleAvatarSize = "2xs" | "xs" | "sm" | "md";

export type ClassicShuffleDensityTokens = {
  /** 1 = largest (5 profiles), lower = more zoomed out */
  scale: number;
  rowPadding: string;
  avatarSize: ClassicShuffleAvatarSize;
  iconSize: number;
  nameClass: string;
  bioClass: string;
  gapClass: string;
  searchHeight: string;
  searchIcon: number;
  searchText: string;
  searchRadius: string;
  searchGap: string;
  filterBtn: string;
  filterIcon: number;
  filterTitle: string;
  filterGap: string;
  filterMt: string;
  metaText: string;
  metaIcon: number;
  metaMt: string;
  headerPb: string;
  headerPt: string;
  densityMt: string;
  followingLabel: string;
  followingAvatar: number;
  followingName: string;
  followingGap: string;
  followingMt: string;
  followingPb: string;
  followingItemW: number;
  anonIcon: number;
  anonTitle: string;
  anonBody: string;
  anonBtnText: string;
  anonBtnPy: string;
  anonMt: string;
  anonPt: string;
  anonIndent: string;
};

const DENSITY_TOKENS: Record<ClassicShuffleDensity, ClassicShuffleDensityTokens> = {
  5: {
    scale: 1,
    rowPadding: "py-3.5",
    avatarSize: "md",
    iconSize: 26,
    nameClass: "text-lg font-medium text-white/92",
    bioClass: "text-sm font-normal text-white/42 line-clamp-2",
    gapClass: "gap-3.5",
    searchHeight: "h-11",
    searchIcon: 18,
    searchText: "text-[15px]",
    searchRadius: "rounded-2xl",
    searchGap: "gap-3",
    filterBtn: "h-10 w-10",
    filterIcon: 18,
    filterTitle: "text-xl font-semibold tracking-[-0.03em]",
    filterGap: "gap-3.5",
    filterMt: "mt-4",
    metaText: "text-[13px]",
    metaIcon: 16,
    metaMt: "mt-3",
    headerPb: "pb-4",
    headerPt: "pt-2",
    densityMt: "mt-2.5",
    followingLabel: "text-[10px]",
    followingAvatar: 44,
    followingName: "text-[10px]",
    followingGap: "gap-2.5",
    followingMt: "mt-3.5",
    followingPb: "pb-3.5",
    followingItemW: 56,
    anonIcon: 16,
    anonTitle: "text-[14px]",
    anonBody: "text-[12px]",
    anonBtnText: "text-[13px]",
    anonBtnPy: "py-2.5",
    anonMt: "mt-3.5",
    anonPt: "pt-3.5",
    anonIndent: "pl-[22px]",
  },
  10: {
    scale: 0.88,
    rowPadding: "py-3",
    avatarSize: "sm",
    iconSize: 22,
    nameClass: "text-base font-medium text-white/90",
    bioClass: "text-xs font-normal text-white/40 line-clamp-2",
    gapClass: "gap-3",
    searchHeight: "h-10",
    searchIcon: 17,
    searchText: "text-sm",
    searchRadius: "rounded-xl",
    searchGap: "gap-2.5",
    filterBtn: "h-9 w-9",
    filterIcon: 17,
    filterTitle: "text-lg font-semibold tracking-[-0.03em]",
    filterGap: "gap-3",
    filterMt: "mt-3.5",
    metaText: "text-xs",
    metaIcon: 15,
    metaMt: "mt-2.5",
    headerPb: "pb-3.5",
    headerPt: "pt-1.5",
    densityMt: "mt-2",
    followingLabel: "text-[9px]",
    followingAvatar: 40,
    followingName: "text-[9px]",
    followingGap: "gap-2",
    followingMt: "mt-3",
    followingPb: "pb-3",
    followingItemW: 52,
    anonIcon: 15,
    anonTitle: "text-[13px]",
    anonBody: "text-[11px]",
    anonBtnText: "text-[12px]",
    anonBtnPy: "py-2",
    anonMt: "mt-3",
    anonPt: "pt-3",
    anonIndent: "pl-5",
  },
  20: {
    scale: 0.74,
    rowPadding: "py-2.5",
    avatarSize: "xs",
    iconSize: 19,
    nameClass: "text-sm font-normal text-white/86",
    bioClass: "text-[11px] font-normal text-white/36 line-clamp-1",
    gapClass: "gap-2.5",
    searchHeight: "h-9",
    searchIcon: 15,
    searchText: "text-[13px]",
    searchRadius: "rounded-xl",
    searchGap: "gap-2",
    filterBtn: "h-8 w-8",
    filterIcon: 15,
    filterTitle: "text-base font-medium tracking-[-0.02em]",
    filterGap: "gap-2.5",
    filterMt: "mt-3",
    metaText: "text-[11px]",
    metaIcon: 14,
    metaMt: "mt-2",
    headerPb: "pb-3",
    headerPt: "pt-1",
    densityMt: "mt-1.5",
    followingLabel: "text-[8px]",
    followingAvatar: 34,
    followingName: "text-[8px]",
    followingGap: "gap-1.5",
    followingMt: "mt-2.5",
    followingPb: "pb-2.5",
    followingItemW: 44,
    anonIcon: 14,
    anonTitle: "text-[12px]",
    anonBody: "text-[10px]",
    anonBtnText: "text-[11px]",
    anonBtnPy: "py-1.5",
    anonMt: "mt-2.5",
    anonPt: "pt-2.5",
    anonIndent: "pl-[18px]",
  },
  30: {
    scale: 0.62,
    rowPadding: "py-2",
    avatarSize: "2xs",
    iconSize: 16,
    nameClass: "text-xs font-normal text-white/82",
    bioClass: "text-[10px] font-normal text-white/32 line-clamp-1",
    gapClass: "gap-2",
    searchHeight: "h-8",
    searchIcon: 14,
    searchText: "text-xs",
    searchRadius: "rounded-lg",
    searchGap: "gap-2",
    filterBtn: "h-7 w-7",
    filterIcon: 14,
    filterTitle: "text-sm font-medium tracking-[-0.02em]",
    filterGap: "gap-2",
    filterMt: "mt-2.5",
    metaText: "text-[10px]",
    metaIcon: 12,
    metaMt: "mt-1.5",
    headerPb: "pb-2.5",
    headerPt: "pt-1",
    densityMt: "mt-1",
    followingLabel: "text-[7px]",
    followingAvatar: 28,
    followingName: "text-[7px]",
    followingGap: "gap-1.5",
    followingMt: "mt-2",
    followingPb: "pb-2",
    followingItemW: 38,
    anonIcon: 12,
    anonTitle: "text-[11px]",
    anonBody: "text-[9px]",
    anonBtnText: "text-[10px]",
    anonBtnPy: "py-1.5",
    anonMt: "mt-2",
    anonPt: "pt-2",
    anonIndent: "pl-4",
  },
  40: {
    scale: 0.52,
    rowPadding: "py-1.5",
    avatarSize: "2xs",
    iconSize: 14,
    nameClass: "text-[11px] font-normal text-white/78",
    bioClass: "text-[9px] font-normal text-white/28 line-clamp-1",
    gapClass: "gap-1.5",
    searchHeight: "h-7",
    searchIcon: 13,
    searchText: "text-[11px]",
    searchRadius: "rounded-lg",
    searchGap: "gap-1.5",
    filterBtn: "h-6 w-6",
    filterIcon: 12,
    filterTitle: "text-xs font-medium",
    filterGap: "gap-2",
    filterMt: "mt-2",
    metaText: "text-[9px]",
    metaIcon: 11,
    metaMt: "mt-1",
    headerPb: "pb-2",
    headerPt: "pt-0.5",
    densityMt: "mt-1",
    followingLabel: "text-[7px]",
    followingAvatar: 24,
    followingName: "text-[7px]",
    followingGap: "gap-1",
    followingMt: "mt-1.5",
    followingPb: "pb-1.5",
    followingItemW: 32,
    anonIcon: 11,
    anonTitle: "text-[10px]",
    anonBody: "text-[8px]",
    anonBtnText: "text-[9px]",
    anonBtnPy: "py-1",
    anonMt: "mt-1.5",
    anonPt: "pt-1.5",
    anonIndent: "pl-3.5",
  },
  50: {
    scale: 0.44,
    rowPadding: "py-1",
    avatarSize: "2xs",
    iconSize: 12,
    nameClass: "text-[10px] font-normal text-white/74",
    bioClass: "text-[8px] font-normal text-white/26 line-clamp-1",
    gapClass: "gap-1.5",
    searchHeight: "h-6",
    searchIcon: 12,
    searchText: "text-[10px]",
    searchRadius: "rounded-md",
    searchGap: "gap-1.5",
    filterBtn: "h-5 w-5",
    filterIcon: 11,
    filterTitle: "text-[11px] font-medium",
    filterGap: "gap-1.5",
    filterMt: "mt-1.5",
    metaText: "text-[8px]",
    metaIcon: 10,
    metaMt: "mt-1",
    headerPb: "pb-1.5",
    headerPt: "pt-0.5",
    densityMt: "mt-0.5",
    followingLabel: "text-[6px]",
    followingAvatar: 20,
    followingName: "text-[6px]",
    followingGap: "gap-1",
    followingMt: "mt-1",
    followingPb: "pb-1",
    followingItemW: 28,
    anonIcon: 10,
    anonTitle: "text-[9px]",
    anonBody: "text-[8px]",
    anonBtnText: "text-[8px]",
    anonBtnPy: "py-1",
    anonMt: "mt-1",
    anonPt: "pt-1",
    anonIndent: "pl-3",
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
  if (typeof window === "undefined") return 20;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = Number(raw);
  return isClassicShuffleDensity(parsed) ? parsed : 20;
}

export function writeClassicShuffleDensity(value: ClassicShuffleDensity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

export function getClassicShuffleDensityTokens(
  density: ClassicShuffleDensity,
): ClassicShuffleDensityTokens {
  return DENSITY_TOKENS[density];
}

/** @deprecated Use getClassicShuffleDensityTokens */
export function getClassicShuffleDensityStyle(density: ClassicShuffleDensity) {
  const tokens = getClassicShuffleDensityTokens(density);
  return {
    rowPadding: tokens.rowPadding,
    avatarSize: tokens.avatarSize === "2xs" ? "xs" : tokens.avatarSize,
    iconSize: tokens.iconSize,
    nameClass: tokens.nameClass,
    bioClass: tokens.bioClass,
    gapClass: tokens.gapClass,
  };
}
