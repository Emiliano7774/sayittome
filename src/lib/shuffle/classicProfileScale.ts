import {
  getClassicShuffleDensityTokens,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";

export function getClassicProfileScale(density: ClassicShuffleDensity) {
  return getClassicShuffleDensityTokens(density).scale;
}

/** Size tokens for classic public profiles — no CSS transform (transform breaks scroll). */
export function getClassicProfileUiTokens(density: ClassicShuffleDensity) {
  const scale = getClassicProfileScale(density);

  return {
    scale,
    heroHeight: `${Math.round(88 * scale)}vh`,
    usernameSize: `${Math.round(64 * scale)}px`,
    usernameSizeMd: `${Math.round(96 * scale)}px`,
    provinceSize: `${Math.round(24 * scale)}px`,
    provinceSizeMd: `${Math.round(30 * scale)}px`,
    lastSeenSize: `${Math.round(20 * scale)}px`,
    lastSeenSizeMd: `${Math.round(24 * scale)}px`,
    bioSize: `${Math.round(20 * scale)}px`,
    bioSizeMd: `${Math.round(30 * scale)}px`,
    statBubble: `${Math.round(80 * scale)}px`,
    statBubbleMd: `${Math.round(112 * scale)}px`,
    statIcon: Math.max(20, Math.round(44 * scale)),
    statValue: `${Math.round(36 * scale)}px`,
    statValueMd: `${Math.round(48 * scale)}px`,
    statLabel: `${Math.round(16 * scale)}px`,
    statLabelMd: `${Math.round(20 * scale)}px`,
    thumb: `${Math.round(80 * scale)}px`,
    editBtnPx: `${Math.round(32 * scale)}px`,
    editBtnPy: `${Math.round(16 * scale)}px`,
    editBtnText: `${Math.max(12, Math.round(16 * scale))}px`,
    createdText: `${Math.max(11, Math.round(14 * scale))}px`,
  };
}
