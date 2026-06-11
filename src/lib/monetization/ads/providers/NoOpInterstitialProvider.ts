import type { InterstitialProvider } from "@/lib/monetization/ads/types";

/** Default interstitial — does nothing until a real network is wired in AdsProvider. */
export class NoOpInterstitialProvider implements InterstitialProvider {
  readonly network = "custom" as const;

  async initialize() {
    return false;
  }

  async prepare() {
    return false;
  }

  async show() {
    return false;
  }
}
