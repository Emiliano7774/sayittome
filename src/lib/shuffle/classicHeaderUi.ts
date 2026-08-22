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
  followingBodyPx: number;
  followingSlotPx: number;
  anonSlotPx: number;
};

function linePx(size: number) {
  return Math.max(1, Math.ceil(size * 1.5));
}

export function classicLinePx(size: number) {
  return linePx(size);
}

export function classicFollowingInnerPx(ui: {
  followingLabelPx: number;
  followingBodyPx: number;
}) {
  return linePx(ui.followingLabelPx) + 8 + ui.followingBodyPx;
}

export function classicAnonInnerPx(ui: {
  anonTitlePx: number;
  anonBodyPx: number;
  anonBtnPx: number;
  anonBtnPadYPx: number;
  filterMtPx: number;
}) {
  const title = linePx(ui.anonTitlePx);
  const body = linePx(ui.anonBodyPx);
  const btn = ui.anonBtnPadYPx * 2 + linePx(ui.anonBtnPx);
  return Math.max(
    title + 6 + btn,
    title + 6 + body + ui.filterMtPx + title + 6 + btn,
  );
}

export function getClassicShuffleHeaderUi(
  density: ClassicShuffleDensity,
): ClassicShuffleHeaderUi {
  const scale = getClassicShuffleDensityTokens(density).scale;

  const followingMtPx = spx(BASE.followingMt, scale, 8);
  const followingPbPx = spx(BASE.followingPb, scale, 8);
  const followingLabelPx = spx(BASE.followingLabel, scale, 8);
  const followingTextPx = spx(BASE.followingText, scale, 9);
  const followingAvatarPx = spx(BASE.followingAvatar, scale, 24);
  const followingBtnTextPx = spx(BASE.followingBtnText, scale, 9);
  const followingBtnPadYPx = spx(BASE.followingBtnPadY, scale, 4);
  const filterMtPx = spx(BASE.filterMt, scale, 8);
  const anonMtPx = spx(BASE.anonMt, scale, 10);
  const anonPtPx = spx(BASE.anonPt, scale, 8);
  const anonMbPx = spx(BASE.anonMb, scale, 8);
  const anonTitlePx = spx(BASE.anonTitle, scale, 11);
  const anonBodyPx = spx(BASE.anonBody, scale, 9);
  const anonBtnPx = spx(BASE.anonBtn, scale, 10);
  const anonBtnPadYPx = spx(BASE.anonBtnPadY, scale, 6);

  const followingBodyPx = Math.max(
    followingAvatarPx + 4 + linePx(followingTextPx),
    linePx(followingTextPx) * 3 + 8 + followingBtnPadYPx * 2 + linePx(followingBtnTextPx),
  );
  const followingSlotPx =
    followingPbPx + 1 + classicFollowingInnerPx({ followingLabelPx, followingBodyPx });
  const anonSlotPx =
    anonPtPx +
    1 +
    classicAnonInnerPx({
      anonTitlePx,
      anonBodyPx,
      anonBtnPx,
      anonBtnPadYPx,
      filterMtPx,
    });

  return {
    scale,
    searchHeightPx: spx(BASE.searchHeight, scale, 32),
    searchIconPx: spx(BASE.searchIcon, scale, 13),
    searchTextPx: spx(BASE.searchText, scale, 11),
    searchPadXPx: spx(BASE.searchPadX, scale, 8),
    searchRadiusPx: spx(BASE.searchRadius, scale, 8),
    filterIconPx: spx(BASE.filterIcon, scale, 13),
    filterTitlePx: spx(BASE.filterTitle, scale, 14),
    filterMtPx,
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
    followingMtPx,
    followingPbPx,
    followingGapPx: spx(BASE.followingGap, scale, 6),
    followingLabelPx,
    followingTextPx,
    followingAvatarPx,
    followingItemWPx: spx(BASE.followingItemW, scale, 32),
    followingBtnTextPx,
    followingBtnPadXPx: spx(BASE.followingBtnPadX, scale, 8),
    followingBtnPadYPx,
    anonMtPx,
    anonPtPx,
    anonMbPx,
    anonIconPx: spx(BASE.anonIcon, scale, 11),
    anonTitlePx,
    anonBodyPx,
    anonBtnPx,
    anonBtnPadYPx,
    onlineDotPx: spx(BASE.onlineDot, scale, 5),
    followingBodyPx,
    followingSlotPx,
    anonSlotPx,
  };
}
