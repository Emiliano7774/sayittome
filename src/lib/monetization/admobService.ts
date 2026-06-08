import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  ADMOB_ANDROID_BANNER_AD_UNIT_ID,
  ADMOB_ANDROID_INTERSTITIAL_AD_UNIT_ID,
  ADMOB_INTERSTITIAL_COOLDOWN_MS,
} from "@/lib/monetization/admobConfig";

let initialized = false;
let initPromise: Promise<boolean> | null = null;
let bannerVisible = false;
let lastBannerMargin = -1;
let bannerQueue: Promise<void> = Promise.resolve();
let syncTimer: number | null = null;

async function loadAdMobModule() {
  return import("@capacitor-community/admob");
}

function runBannerTask(task: () => Promise<void>) {
  bannerQueue = bannerQueue.then(task).catch((error) => {
    console.error("AdMob banner task failed:", error);
  });
  return bannerQueue;
}

/** Distance from screen bottom to top of bottom nav — AdMob sits below the web nav. */
export function measureBottomNavClearancePx() {
  if (typeof window === "undefined") return 0;

  if (document.body.classList.contains("sayittome-story-viewer-open")) {
    return 0;
  }

  const nav = document.querySelector(".sayittome-bottom-nav");
  if (!nav) return 0;

  const style = window.getComputedStyle(nav);
  if (style.display === "none" || style.visibility === "hidden") return 0;

  return Math.max(0, Math.round(nav.getBoundingClientRect().height));
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

async function renderAdMobBanner(margin: number) {
  if (bannerVisible && margin === lastBannerMargin) return;

  const { AdMob, BannerAdPosition, BannerAdSize } = await loadAdMobModule();

  if (bannerVisible) {
    try {
      await AdMob.removeBanner();
    } catch {
      // Ignore when banner was never shown.
    }
    document.body.classList.remove("sayittome-admob-banner-visible");
    bannerVisible = false;
  }

  await AdMob.showBanner({
    adId: ADMOB_ANDROID_BANNER_AD_UNIT_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin,
  });

  bannerVisible = true;
  lastBannerMargin = margin;
  document.body.classList.add("sayittome-admob-banner-visible");
}

export async function showAdMobBanner() {
  if (!(await initializeAdMob())) return false;

  return runBannerTask(async () => {
    try {
      const margin = measureBottomNavClearancePx();
      await renderAdMobBanner(margin);
    } catch (error) {
      console.error("AdMob banner failed:", error);
      bannerVisible = false;
      lastBannerMargin = -1;
      document.body.classList.remove("sayittome-admob-banner-visible");
    }
  })
    .then(() => true)
    .catch(() => false);
}

export function scheduleAdMobBannerSync(delayMs = 180) {
  if (typeof window === "undefined") return;
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncAdMobBannerPosition();
  }, delayMs);
}

export async function syncAdMobBannerPosition() {
  if (!isNativeAppShell() || !initialized || !bannerVisible) return;

  const margin = measureBottomNavClearancePx();
  if (margin === lastBannerMargin) return;

  await runBannerTask(async () => {
    try {
      await renderAdMobBanner(margin);
    } catch (error) {
      console.error("AdMob banner sync failed:", error);
    }
  });
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
  lastBannerMargin = -1;

  if (!initialized) return;

  await runBannerTask(async () => {
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
  });
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
