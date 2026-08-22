import { isNativeAppShell } from "@/lib/app/nativeShell";
import { areFeedAdsEnabled, SHUFFLE_FEED_AD_INTERVAL } from "@/lib/monetization/ads";
import {
  SHUFFLE_MONETAG_AD_INTERVAL,
} from "@/lib/monetization/monetagConfig";

const SHUFFLE_AD_INTERVAL = SHUFFLE_MONETAG_AD_INTERVAL;

export function shouldShowShuffleMonetagAds(_profileCount: number) {
  return false;
}

export function shouldShowShuffleNativeAds(profileCount: number) {
  return (
    areFeedAdsEnabled() &&
    isNativeAppShell() &&
    profileCount >= SHUFFLE_FEED_AD_INTERVAL
  );
}

export function shouldShowShuffleFeedAds(profileCount: number) {
  return shouldShowShuffleMonetagAds(profileCount) || shouldShowShuffleNativeAds(profileCount);
}

/** @deprecated Use shouldShowShuffleFeedAds or the specific provider helpers. */
export function shouldShowShuffleNativeAdsLegacy(profileCount: number) {
  return shouldShowShuffleFeedAds(profileCount);
}

export function getShuffleFeedAdCount(
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds) return 0;
  return Math.floor(profileCount / SHUFFLE_AD_INTERVAL);
}

export function getShuffleFeedItemCount(
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds) return profileCount;
  return profileCount + getShuffleFeedAdCount(profileCount, true);
}

export function isShuffleFeedAdIndex(
  index: number,
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds || profileCount < SHUFFLE_AD_INTERVAL) return false;
  if (index < SHUFFLE_AD_INTERVAL) return false;
  return (index + 1) % (SHUFFLE_AD_INTERVAL + 1) === 0;
}

/** @deprecated Use isShuffleFeedAdIndex */
export function isShuffleNativeAdIndex(
  index: number,
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  return isShuffleFeedAdIndex(index, profileCount, showAds);
}

/** Maps a visual feed index to the underlying profile array index. */
export function getShuffleProfileIndex(
  index: number,
  profileCount: number,
  showAds: boolean,
) {
  if (!showAds || profileCount < SHUFFLE_AD_INTERVAL) return index;
  return index - Math.floor((index + 1) / (SHUFFLE_AD_INTERVAL + 1));
}

/** Profile indices actually rendered for a feed of `profileCount` cards. */
export function enumerateShuffleFeedProfileIndices(
  profileCount: number,
  showAds: boolean,
) {
  const itemCount = getShuffleFeedItemCount(profileCount, showAds);
  const indices: number[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    if (isShuffleFeedAdIndex(index, profileCount, showAds)) continue;
    indices.push(getShuffleProfileIndex(index, profileCount, showAds));
  }
  return indices;
}

export function getShuffleFeedAdInterval() {
  return SHUFFLE_AD_INTERVAL;
}

export function getShuffleAdSlotId(mode: "modern" | "classic", feedIndex: number) {
  return `shuffle-ad-${mode}-${feedIndex}`;
}

/** @deprecated Use getShuffleAdSlotId */
export function getShuffleNativeAdSlotId(mode: "modern" | "classic", feedIndex: number) {
  return getShuffleAdSlotId(mode, feedIndex);
}
