/**
 * Unity Ads integration stub.
 *
 * Steps when ready:
 * 1. Add com.unity3d.ads:unity-ads (+ Capacitor wrapper or custom plugin).
 * 2. Initialize with AD_UNIT_IDS.unity.gameId in MainActivity or JS bootstrap.
 * 3. Implement UnityBannerProvider, UnityInterstitialProvider, UnityRewardedProvider.
 * 4. Set ACTIVE_AD_NETWORK = "unity" and register in AdsProvider.ts.
 */

export { NoOpBannerProvider as UnityBannerProvider } from "@/lib/monetization/ads/providers/NoOpBannerProvider";
export { NoOpInterstitialProvider as UnityInterstitialProvider } from "@/lib/monetization/ads/providers/NoOpInterstitialProvider";
export { NoOpRewardedProvider as UnityRewardedProvider } from "@/lib/monetization/ads/providers/NoOpRewardedProvider";
