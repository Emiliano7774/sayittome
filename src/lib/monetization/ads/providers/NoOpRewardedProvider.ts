import type { RewardedProvider, RewardedShowResult } from "@/lib/monetization/ads/types";

/** Default rewarded — does nothing until a real network is wired in AdsProvider. */
export class NoOpRewardedProvider implements RewardedProvider {
  readonly network = "custom" as const;

  async initialize() {
    return false;
  }

  async prepare() {
    return false;
  }

  async show(): Promise<RewardedShowResult> {
    return { shown: false, rewarded: false };
  }
}
