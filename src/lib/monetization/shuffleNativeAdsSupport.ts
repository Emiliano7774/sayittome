import { isNativeAppShell } from "@/lib/app/nativeShell";
import { SayittomeNativeAds } from "@/lib/monetization/sayittomeNativeAdsPlugin";

const MIN_INLINE_PLUGIN_VERSION = 2;

let supportPromise: Promise<boolean> | null = null;

export async function shuffleNativeInlineAdsSupported() {
  if (!isNativeAppShell()) return false;
  if (supportPromise) return supportPromise;

  supportPromise = (async () => {
    try {
      const info = await SayittomeNativeAds.getPluginInfo();
      return Number(info.version) >= MIN_INLINE_PLUGIN_VERSION && info.inline === true;
    } catch {
      return false;
    }
  })();

  return supportPromise;
}

export function resetShuffleNativeInlineAdsSupportCache() {
  supportPromise = null;
}
