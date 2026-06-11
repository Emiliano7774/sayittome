import type { FeedAdProvider } from "@/lib/monetization/ads/types";

/** Default shuffle feed ads — returns null until a real network is wired in AdsProvider. */
export class NoOpFeedAdProvider implements FeedAdProvider {
  readonly network = "custom" as const;

  async initialize() {
    return false;
  }

  async load() {
    return null;
  }

  async recordImpression() {}

  async performClick() {}

  async destroy() {}

  async destroyAll() {}
}
