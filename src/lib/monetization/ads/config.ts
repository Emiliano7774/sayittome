/**
 * Monetization feature flag.
 *
 * false → no ads load, no AD_ID required, Play Console → "Publicar sin permiso".
 * true  → connect a network in AdsProvider.ts and add the matching Android deps.
 */
export const ADS_ENABLED = false;

import type { AdNetworkId } from "@/lib/monetization/ads/types";

/** Active network when ADS_ENABLED is true. Change this single value to switch providers. */
export const ACTIVE_AD_NETWORK: AdNetworkId = "admob";

/** Show interstitial after this many user actions (navigation, key taps, etc.). */
export const INTERSTITIAL_ACTION_INTERVAL = 8;

/** Minimum ms between interstitial attempts. */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;

/** Insert one feed ad slot after every N profiles in shuffle. */
export const SHUFFLE_FEED_AD_INTERVAL = 5;

/** Reserved unit IDs — fill when enabling a network (see providers/admob/index.ts, etc.). */
export const AD_UNIT_IDS = {
  admob: {
    appId: "ca-app-pub-2444753148883536~7536175431",
    banner: "ca-app-pub-2444753148883536/8314904630",
    interstitial: "ca-app-pub-2444753148883536/9963257132",
    rewarded: "",
    nativeFeed: "ca-app-pub-2444753148883536/8428630876",
    appOpen: "ca-app-pub-2444753148883536/1759280741",
  },
  applovin: { appId: "", banner: "", interstitial: "", rewarded: "", nativeFeed: "" },
  unity: { gameId: "", banner: "", interstitial: "", rewarded: "" },
  ironsource: { appKey: "", banner: "", interstitial: "", rewarded: "" },
} as const;

export function areAdsEnabled() {
  return ADS_ENABLED;
}

export function areFeedAdsEnabled() {
  return ADS_ENABLED;
}
