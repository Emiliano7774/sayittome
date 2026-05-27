import { isNativeAppShell } from "@/lib/app/nativeShell";
import { SHUFFLE_NATIVE_AD_INTERVAL } from "@/lib/monetization/admobConfig";

export function shouldShowShuffleAdMobAds(profileCount: number) {
  return isNativeAppShell() && profileCount >= SHUFFLE_NATIVE_AD_INTERVAL;
}

export function shouldShowShuffleMonetagAds(profileCount: number) {
  return !isNativeAppShell() && profileCount >= SHUFFLE_NATIVE_AD_INTERVAL;
}

export function shouldShowShuffleFeedAds(profileCount: number) {
  return shouldShowShuffleAdMobAds(profileCount) || shouldShowShuffleMonetagAds(profileCount);
}

/** @deprecated Use shouldShowShuffleFeedAds or the specific provider helpers. */
export function shouldShowShuffleNativeAds(profileCount: number) {
  return shouldShowShuffleFeedAds(profileCount);
}

export function getShuffleNativeAdCount(
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds) return 0;
  return Math.floor(profileCount / SHUFFLE_NATIVE_AD_INTERVAL);
}

export function getShuffleFeedItemCount(
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds) return profileCount;
  return profileCount + getShuffleNativeAdCount(profileCount, true);
}

export function isShuffleNativeAdIndex(
  index: number,
  profileCount: number,
  showAds = shouldShowShuffleFeedAds(profileCount),
) {
  if (!showAds || profileCount < SHUFFLE_NATIVE_AD_INTERVAL) return false;
  if (index < SHUFFLE_NATIVE_AD_INTERVAL) return false;
  return (index + 1) % (SHUFFLE_NATIVE_AD_INTERVAL + 1) === 0;
}

/** Maps a visual feed index to the underlying profile array index. */
export function getShuffleProfileIndex(index: number) {
  return index - Math.floor((index + 1) / (SHUFFLE_NATIVE_AD_INTERVAL + 1));
}

export function getShuffleAdSlotId(mode: "modern" | "classic", feedIndex: number) {
  return `shuffle-ad-${mode}-${feedIndex}`;
}

/** @deprecated Use getShuffleAdSlotId. */
export function getShuffleNativeAdSlotId(mode: "modern" | "classic", feedIndex: number) {
  return getShuffleAdSlotId(mode, feedIndex);
}
