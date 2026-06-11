/**
 * AdMob integration stub — connect when ADS_ENABLED = true.
 *
 * Steps (Android, ~minutes):
 * 1. npm i @capacitor-community/admob
 * 2. npx cap sync android
 * 3. android/app/build.gradle → implementation 'com.google.android.gms:play-services-ads'
 * 4. AndroidManifest.xml → AD_ID permission + com.google.android.gms.ads.APPLICATION_ID
 * 5. Implement AdMobBannerProvider, AdMobInterstitialProvider, AdMobRewardedProvider
 *    using @capacitor-community/admob (banner/interstitial/rewarded).
 * 6. For shuffle feed native ads: custom Capacitor plugin or AdMob NativeAdvanced.
 * 7. Set ACTIVE_AD_NETWORK = "admob" in config.ts and wire providers in AdsProvider.ts.
 *
 * Unit IDs are already reserved in config.ts → AD_UNIT_IDS.admob
 */

export { NoOpBannerProvider as AdMobBannerProvider } from "@/lib/monetization/ads/providers/NoOpBannerProvider";
export { NoOpInterstitialProvider as AdMobInterstitialProvider } from "@/lib/monetization/ads/providers/NoOpInterstitialProvider";
export { NoOpRewardedProvider as AdMobRewardedProvider } from "@/lib/monetization/ads/providers/NoOpRewardedProvider";
export { NoOpFeedAdProvider as AdMobFeedAdProvider } from "@/lib/monetization/ads/providers/NoOpFeedAdProvider";
