/**
 * AppLovin MAX integration stub.
 *
 * Steps when ready:
 * 1. Add AppLovin MAX SDK + Capacitor bridge (or custom plugin).
 * 2. android/app/build.gradle → com.applovin:applovin-sdk (+ mediation adapters if needed).
 * 3. AndroidManifest → com.applovin.sdk.key meta-data.
 * 4. Implement AppLovinBannerProvider, AppLovinInterstitialProvider, AppLovinRewardedProvider.
 * 5. Set ACTIVE_AD_NETWORK = "applovin" and register in AdsProvider.ts.
 *
 * AD_ID may be required — declare com.google.android.gms.permission.AD_ID if using Google mediation.
 */

export { NoOpBannerProvider as AppLovinBannerProvider } from "@/lib/monetization/ads/providers/NoOpBannerProvider";
export { NoOpInterstitialProvider as AppLovinInterstitialProvider } from "@/lib/monetization/ads/providers/NoOpInterstitialProvider";
export { NoOpRewardedProvider as AppLovinRewardedProvider } from "@/lib/monetization/ads/providers/NoOpRewardedProvider";
