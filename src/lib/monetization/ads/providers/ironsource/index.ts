/**
 * ironSource / LevelPlay integration stub.
 *
 * Steps when ready:
 * 1. Add com.ironsource.sdk:mediationsdk (+ Capacitor bridge).
 * 2. Initialize with AD_UNIT_IDS.ironsource.appKey.
 * 3. Implement IronSourceBannerProvider, IronSourceInterstitialProvider, IronSourceRewardedProvider.
 * 4. Set ACTIVE_AD_NETWORK = "ironsource" and register in AdsProvider.ts.
 */

export { NoOpBannerProvider as IronSourceBannerProvider } from "@/lib/monetization/ads/providers/NoOpBannerProvider";
export { NoOpInterstitialProvider as IronSourceInterstitialProvider } from "@/lib/monetization/ads/providers/NoOpInterstitialProvider";
export { NoOpRewardedProvider as IronSourceRewardedProvider } from "@/lib/monetization/ads/providers/NoOpRewardedProvider";
