export { adsProvider } from "@/lib/monetization/ads/AdsProvider";
export {
  ADS_ENABLED,
  ACTIVE_AD_NETWORK,
  AD_UNIT_IDS,
  areAdsEnabled,
  areFeedAdsEnabled,
  INTERSTITIAL_ACTION_INTERVAL,
  INTERSTITIAL_COOLDOWN_MS,
  SHUFFLE_FEED_AD_INTERVAL,
} from "@/lib/monetization/ads/config";
export {
  isShuffleRoute,
  shouldShowBanner,
  shouldShowFeedAds,
  shouldShowInterstitial,
} from "@/lib/monetization/ads/surfaces";
export { measureBottomNavClearancePx } from "@/lib/monetization/ads/bannerLayout";
export type {
  AdNetworkId,
  BannerProvider,
  FeedAdContent,
  FeedAdProvider,
  InterstitialProvider,
  RewardedProvider,
} from "@/lib/monetization/ads/types";
