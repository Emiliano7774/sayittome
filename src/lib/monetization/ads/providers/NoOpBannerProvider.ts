import type { BannerProvider, BannerShowOptions } from "@/lib/monetization/ads/types";

/** Default banner — does nothing until a real network is wired in AdsProvider. */
export class NoOpBannerProvider implements BannerProvider {
  readonly network = "custom" as const;

  async initialize() {
    return false;
  }

  async show(_options?: BannerShowOptions) {
    return false;
  }

  async hide() {}

  async remove() {
    document.body.classList.remove("sayittome-ad-banner-visible");
  }

  async syncPosition(_marginBottomPx: number) {}
}
