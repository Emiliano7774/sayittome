import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { ADMOB_ANDROID_NATIVE_AD_UNIT_ID } from "@/lib/monetization/admobConfig";

export type NativeAdPosition = {
  slotId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type InlineNativeAdContent = {
  slotId: string;
  loaded: boolean;
  inline?: boolean;
  headline?: string;
  body?: string;
  cta?: string;
  advertiser?: string;
  iconUrl?: string;
};

export interface SayittomeNativeAdsPlugin {
  getPluginInfo(): Promise<{ version: number; inline: boolean }>;
  loadNativeAd(options: {
    slotId: string;
    adUnitId?: string;
    factoryId?: string;
    inline?: boolean;
  }): Promise<InlineNativeAdContent>;
  positionNativeAd(options: NativeAdPosition): Promise<void>;
  hideNativeAd(options: { slotId: string }): Promise<void>;
  destroyNativeAd(options: { slotId: string }): Promise<void>;
  destroyAllNativeAds(): Promise<void>;
  recordNativeAdImpression(options: { slotId: string }): Promise<void>;
  performNativeAdClick(options: { slotId: string }): Promise<void>;
  addListener(
    eventName: "nativeAdScroll",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
}

const noopPlugin: SayittomeNativeAdsPlugin = {
  async getPluginInfo() {
    return { version: 0, inline: false };
  },
  async loadNativeAd({ slotId }) {
    return { slotId, loaded: false };
  },
  async positionNativeAd() {},
  async hideNativeAd() {},
  async destroyNativeAd() {},
  async destroyAllNativeAds() {},
  async recordNativeAdImpression() {},
  async performNativeAdClick() {},
  async addListener() {
    return { remove: async () => undefined };
  },
};

export const SayittomeNativeAds = registerPlugin<SayittomeNativeAdsPlugin>(
  "SayittomeNativeAds",
  {
    web: () => Promise.resolve(noopPlugin),
  },
);

export async function loadShuffleInlineNativeAd(slotId: string) {
  return SayittomeNativeAds.loadNativeAd({
    slotId,
    adUnitId: ADMOB_ANDROID_NATIVE_AD_UNIT_ID,
    factoryId: "sayittomeNativeListTile",
    inline: true,
  });
}
