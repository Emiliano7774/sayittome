/**
 * Monetag web monetization — independent from ADS_ENABLED / AdMob / AppLovin.
 */
export const MONETAG_WEB_ENABLED = true;

/** Disabled on web: A/B/A on a physical Samsung showed full-viewport ad
 * iframes consuming every one-finger touch and preventing Shuffle scroll.
 * The user rejects popunder/fullscreen interception. Retain separate inline
 * ad capability and do not alter native or Firebase messaging notifications.
 */
export const MONETAG_VIGNETTE_WEB_ENABLED = false;
export const MONETAG_PUSH_TAG_WEB_ENABLED = false;

/** Insert one inline Monetag slot after every N profiles in shuffle (web only). */
export const SHUFFLE_MONETAG_AD_INTERVAL = 5;

export function isMonetagWebEnabled() {
  return MONETAG_WEB_ENABLED;
}
