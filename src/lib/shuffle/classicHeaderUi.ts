import {
  getClassicShuffleDensityTokens,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";

/** Base sizes at density 5 (scale = 1). Everything scales from here. */
const BASE = {
  searchHeight: 44,
  searchIcon: 18,
  searchText: 15,
  searchPadX: 12,
  searchRadius: 16,
  filterIcon: 18,
  filterTitle: 20,
  metaText: 13,
  metaIcon: 16,
  metaDensityGap: 14,
  densityGap: 6,
  densityZoomBtn: 32,
  densityZoomIcon: 15,
  densityNumText: 11,
  densityNumMinW: 32,
  densityNumPadX: 8,
  densityNumPadY: 4,
  densityTrackPad: 4,
  followingMt: 20,
  followingPb: 14,
  followingGap: 10,
  followingLabel: 10,
  followingText: 11,
  followingAvatar: 52,
  followingItemW: 54,
  followingBtnText: 12,
  followingBtnPadX: 14,
  followingBtnPadY: 7,
  filterMt: 16,
  metaMt: 12,
  anonMt: 20,
  anonPt: 16,
  anonMb: 16,
  anonIcon: 16,
  anonTitle: 14,
  anonBody: 12,
  anonBtn: 13,
  anonBtnPadY: 10,
  onlineDot: 10,
} as const;

function spx(value: number, scale: number, min = 0) {
  return Math.max(min, Math.round(value * scale));
}

export type ClassicShuffleHeaderUi = {
  scale: number;
  searchHeightPx: number;
  searchIconPx: number;
  searchTextPx: number;
  searchPadXPx: number;
  searchRadiusPx: number;
  filterIconPx: number;
  filterTitlePx: number;
  filterMtPx: number;
  metaTextPx: number;
  metaIconPx: number;
  metaMtPx: number;
  metaDensityGapPx: number;
  densityGapPx: number;
  densityZoomBtnPx: number;
  densityZoomIconPx: number;
  densityNumTextPx: number;
  densityNumMinWPx: number;
  densityNumPadXPx: number;
  densityNumPadYPx: number;
  densityTrackPadPx: number;
  followingMtPx: number;
  followingPbPx: number;
  followingGapPx: number;
  followingLabelPx: number;
  followingTextPx: number;
  followingAvatarPx: number;
  followingItemWPx: number;
  followingBtnTextPx: number;
  followingBtnPadXPx: number;
  followingBtnPadYPx: number;
  anonMtPx: number;
  anonPtPx: number;
  anonMbPx: number;
  anonIconPx: number;
  anonTitlePx: number;
  anonBodyPx: number;
  anonBtnPx: number;
  anonBtnPadYPx: number;
  onlineDotPx: number;
};

export function getClassicShuffleHeaderUi(
  density: ClassicShuffleDensity,
): ClassicShuffleHeaderUi {
  const scale = getClassicShuffleDensityTokens(density).scale;

  return {
    scale,
    searchHeightPx: spx(BASE.searchHeight, scale, 32),
    searchIconPx: spx(BASE.searchIcon, scale, 13),
    searchTextPx: spx(BASE.searchText, scale, 11),
    searchPadXPx: spx(BASE.searchPadX, scale, 8),
    searchRadiusPx: spx(BASE.searchRadius, scale, 8),
    filterIconPx: spx(BASE.filterIcon, scale, 13),
    filterTitlePx: spx(BASE.filterTitle, scale, 14),
    filterMtPx: spx(BASE.filterMt, scale, 8),
    metaTextPx: spx(BASE.metaText, scale, 10),
    metaIconPx: spx(BASE.metaIcon, scale, 11),
    metaMtPx: spx(BASE.metaMt, scale, 6),
    metaDensityGapPx: spx(BASE.metaDensityGap, scale, 8),
    densityGapPx: spx(BASE.densityGap, scale, 4),
    densityZoomBtnPx: spx(BASE.densityZoomBtn, scale, 24),
    densityZoomIconPx: spx(BASE.densityZoomIcon, scale, 12),
    densityNumTextPx: spx(BASE.densityNumText, scale, 9),
    densityNumMinWPx: spx(BASE.densityNumMinW, scale, 24),
    densityNumPadXPx: spx(BASE.densityNumPadX, scale, 6),
    densityNumPadYPx: spx(BASE.densityNumPadY, scale, 3),
    densityTrackPadPx: spx(BASE.densityTrackPad, scale, 3),
    followingMtPx: spx(BASE.followingMt, scale, 8),
    followingPbPx: spx(BASE.followingPb, scale, 8),
    followingGapPx: spx(BASE.followingGap, scale, 6),
    followingLabelPx: spx(BASE.followingLabel, scale, 8),
    followingTextPx: spx(BASE.followingText, scale, 9),
    followingAvatarPx: spx(BASE.followingAvatar, scale, 24),
    followingItemWPx: spx(BASE.followingItemW, scale, 32),
    followingBtnTextPx: spx(BASE.followingBtnText, scale, 9),
    followingBtnPadXPx: spx(BASE.followingBtnPadX, scale, 8),
    followingBtnPadYPx: spx(BASE.followingBtnPadY, scale, 4),
    anonMtPx: spx(BASE.anonMt, scale, 10),
    anonPtPx: spx(BASE.anonPt, scale, 8),
    anonMbPx: spx(BASE.anonMb, scale, 8),
    anonIconPx: spx(BASE.anonIcon, scale, 11),
    anonTitlePx: spx(BASE.anonTitle, scale, 11),
    anonBodyPx: spx(BASE.anonBody, scale, 9),
    anonBtnPx: spx(BASE.anonBtn, scale, 10),
    anonBtnPadYPx: spx(BASE.anonBtnPadY, scale, 6),
    onlineDotPx: spx(BASE.onlineDot, scale, 5),
  };
}
