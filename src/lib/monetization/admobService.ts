import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  ADMOB_ANDROID_BANNER_AD_UNIT_ID,
  ADMOB_ANDROID_INTERSTITIAL_AD_UNIT_ID,
  ADMOB_INTERSTITIAL_COOLDOWN_MS,
} from "@/lib/monetization/admobConfig";

let initialized = false;
let initPromise: Promise<boolean> | null = null;
let bannerVisible = false;

async function loadAdMobModule() {
  return import("@capacitor-community/admob");
}

export async function initializeAdMob() {
  if (!isNativeAppShell()) return false;
  if (initialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { AdMob } = await loadAdMobModule();
      await AdMob.initialize();
      initialized = true;
      return true;
    } catch (error) {
      console.error("AdMob initialize failed:", error);
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

export async function showAdMobBanner() {
  if (!(await initializeAdMob())) return false;

  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await loadAdMobModule();
    await AdMob.showBanner({
      adId: ADMOB_ANDROID_BANNER_AD_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    });
    bannerVisible = true;
    document.body.classList.add("sayittome-admob-banner-visible");
    return true;
  } catch (error) {
    console.error("AdMob banner failed:", error);
    return false;
  }
}

export async function hideAdMobBanner() {
  document.body.classList.remove("sayittome-admob-banner-visible");

  if (!initialized || !bannerVisible) return;

  try {
    const { AdMob } = await loadAdMobModule();
    await AdMob.hideBanner();
  } catch {
    // Ignore when banner was never shown.
  }
}

export async function removeAdMobBanner() {
  document.body.classList.remove("sayittome-admob-banner-visible");
  bannerVisible = false;

  if (!initialized) return;

  try {
    const { AdMob } = await loadAdMobModule();
    await AdMob.removeBanner();
  } catch {
    try {
      const { AdMob } = await loadAdMobModule();
      await AdMob.hideBanner();
    } catch {
      // Ignore when banner was never shown.
    }
  }
}

export async function prepareAdMobInterstitial() {
  if (!(await initializeAdMob())) return false;

  try {
    const { AdMob } = await loadAdMobModule();
    await AdMob.prepareInterstitial({
      adId: ADMOB_ANDROID_INTERSTITIAL_AD_UNIT_ID,
    });
    return true;
  } catch (error) {
    console.error("AdMob interstitial prepare failed:", error);
    return false;
  }
}

export async function showAdMobInterstitial() {
  if (!(await initializeAdMob())) return false;

  try {
    const { AdMob } = await loadAdMobModule();
    await AdMob.showInterstitial();
    return true;
  } catch (error) {
    console.error("AdMob interstitial show failed:", error);
    return false;
  }
}

export { ADMOB_INTERSTITIAL_COOLDOWN_MS };
