/**
 * Monetag web monetization — independent from ADS_ENABLED / AdMob / AppLovin.
 */
export const MONETAG_WEB_ENABLED = true;

/** Insert one inline Monetag slot after every N profiles in shuffle (web only). */
export const SHUFFLE_MONETAG_AD_INTERVAL = 5;

export function isMonetagWebEnabled() {
  return MONETAG_WEB_ENABLED;
}
