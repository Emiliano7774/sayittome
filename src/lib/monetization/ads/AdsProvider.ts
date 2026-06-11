import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  ACTIVE_AD_NETWORK,
  areAdsEnabled,
  INTERSTITIAL_ACTION_INTERVAL,
  INTERSTITIAL_COOLDOWN_MS,
} from "@/lib/monetization/ads/config";
import { measureBottomNavClearancePx } from "@/lib/monetization/ads/bannerLayout";
import { NoOpBannerProvider } from "@/lib/monetization/ads/providers/NoOpBannerProvider";
import { NoOpFeedAdProvider } from "@/lib/monetization/ads/providers/NoOpFeedAdProvider";
import { NoOpInterstitialProvider } from "@/lib/monetization/ads/providers/NoOpInterstitialProvider";
import { NoOpRewardedProvider } from "@/lib/monetization/ads/providers/NoOpRewardedProvider";
import {
  AdMobBannerProvider,
  AdMobFeedAdProvider,
  AdMobInterstitialProvider,
  AdMobRewardedProvider,
} from "@/lib/monetization/ads/providers/admob";
import {
  AppLovinBannerProvider,
  AppLovinInterstitialProvider,
  AppLovinRewardedProvider,
} from "@/lib/monetization/ads/providers/applovin";
import {
  IronSourceBannerProvider,
  IronSourceInterstitialProvider,
  IronSourceRewardedProvider,
} from "@/lib/monetization/ads/providers/ironsource";
import {
  UnityBannerProvider,
  UnityInterstitialProvider,
  UnityRewardedProvider,
} from "@/lib/monetization/ads/providers/unity";
import type {
  BannerProvider,
  FeedAdProvider,
  InterstitialProvider,
  RewardedProvider,
} from "@/lib/monetization/ads/types";

/**
 * Central ads facade. Swap providers here when enabling monetization.
 *
 * Current state: NoOp providers — zero ads, zero SDK init, no AD_ID.
 */
function createProviders() {
  if (!areAdsEnabled()) {
    return {
      banner: new NoOpBannerProvider(),
      interstitial: new NoOpInterstitialProvider(),
      rewarded: new NoOpRewardedProvider(),
      feed: new NoOpFeedAdProvider(),
    };
  }

  switch (ACTIVE_AD_NETWORK) {
    case "admob":
      return {
        banner: new AdMobBannerProvider(),
        interstitial: new AdMobInterstitialProvider(),
        rewarded: new AdMobRewardedProvider(),
        feed: new AdMobFeedAdProvider(),
      };
    case "applovin":
      return {
        banner: new AppLovinBannerProvider(),
        interstitial: new AppLovinInterstitialProvider(),
        rewarded: new AppLovinRewardedProvider(),
        feed: new NoOpFeedAdProvider(),
      };
    case "unity":
      return {
        banner: new UnityBannerProvider(),
        interstitial: new UnityInterstitialProvider(),
        rewarded: new UnityRewardedProvider(),
        feed: new NoOpFeedAdProvider(),
      };
    case "ironsource":
      return {
        banner: new IronSourceBannerProvider(),
        interstitial: new IronSourceInterstitialProvider(),
        rewarded: new IronSourceRewardedProvider(),
        feed: new NoOpFeedAdProvider(),
      };
    default:
      return {
        banner: new NoOpBannerProvider(),
        interstitial: new NoOpInterstitialProvider(),
        rewarded: new NoOpRewardedProvider(),
        feed: new NoOpFeedAdProvider(),
      };
  }
}

class AdsProviderFacade {
  readonly banner: BannerProvider;
  readonly interstitial: InterstitialProvider;
  readonly rewarded: RewardedProvider;
  readonly feed: FeedAdProvider;

  private initialized = false;
  private initPromise: Promise<boolean> | null = null;
  private interstitialReady = false;
  private lastInterstitialAt = 0;
  private actionCount = 0;
  private bannerVisible = false;
  private bannerSyncTimer: number | null = null;

  constructor() {
    const providers = createProviders();
    this.banner = providers.banner;
    this.interstitial = providers.interstitial;
    this.rewarded = providers.rewarded;
    this.feed = providers.feed;
  }

  get enabled() {
    return areAdsEnabled() && isNativeAppShell();
  }

  async initialize() {
    if (!this.enabled) return false;
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const results = await Promise.all([
        this.banner.initialize(),
        this.interstitial.initialize(),
        this.rewarded.initialize(),
        this.feed.initialize(),
      ]);
      this.initialized = results.some(Boolean);
      return this.initialized;
    })();

    return this.initPromise;
  }

  /** INSERTION POINT: fixed bottom banner. */
  async showBanner() {
    if (!this.enabled || !(await this.initialize())) return false;

    const margin = measureBottomNavClearancePx();
    const shown = await this.banner.show({ marginBottomPx: margin });
    if (shown) {
      this.bannerVisible = true;
      document.body.classList.add("sayittome-ad-banner-visible");
    }
    return shown;
  }

  async hideBanner() {
    document.body.classList.remove("sayittome-ad-banner-visible");
    this.bannerVisible = false;
    if (!this.initialized) return;
    await this.banner.hide();
  }

  async removeBanner() {
    document.body.classList.remove("sayittome-ad-banner-visible");
    this.bannerVisible = false;
    if (!this.initialized) return;
    await this.banner.remove();
  }

  scheduleBannerSync(delayMs = 180) {
    if (typeof window === "undefined" || !this.bannerVisible) return;
    if (this.bannerSyncTimer) window.clearTimeout(this.bannerSyncTimer);

    this.bannerSyncTimer = window.setTimeout(() => {
      this.bannerSyncTimer = null;
      void this.syncBannerPosition();
    }, delayMs);
  }

  async syncBannerPosition() {
    if (!this.enabled || !this.initialized || !this.bannerVisible) return;
    const margin = measureBottomNavClearancePx();
    await this.banner.syncPosition?.(margin);
  }

  /** INSERTION POINT: interstitial every X user actions (see recordUserAction). */
  async prepareInterstitial() {
    if (!this.enabled || !(await this.initialize())) return false;
    this.interstitialReady = await this.interstitial.prepare();
    return this.interstitialReady;
  }

  async showInterstitial() {
    if (!this.enabled) return false;

    const now = Date.now();
    if (now - this.lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) return false;

    if (!this.interstitialReady) {
      await this.prepareInterstitial();
      if (!this.interstitialReady) return false;
    }

    const shown = await this.interstitial.show();
    if (shown) {
      this.lastInterstitialAt = now;
      this.interstitialReady = false;
      void this.prepareInterstitial();
    }
    return shown;
  }

  /**
   * Call from meaningful user actions (profile open, shuffle refresh, etc.).
   * When action count hits INTERSTITIAL_ACTION_INTERVAL, tries an interstitial.
   */
  async recordUserAction() {
    if (!this.enabled) return;
    this.actionCount += 1;

    if (this.actionCount % INTERSTITIAL_ACTION_INTERVAL !== 0) return;
    await this.showInterstitial();
  }

  /** INSERTION POINT: optional rewarded ad (boost, extra shuffle, etc.). */
  async showRewarded() {
    if (!this.enabled || !(await this.initialize())) {
      return { shown: false, rewarded: false };
    }

    const prepared = await this.rewarded.prepare();
    if (!prepared) return { shown: false, rewarded: false };
    return this.rewarded.show();
  }

  async destroyFeedAds() {
    if (!this.initialized) return;
    await this.feed.destroyAll();
  }
}

export const adsProvider = new AdsProviderFacade();
