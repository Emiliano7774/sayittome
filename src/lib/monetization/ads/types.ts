export type AdNetworkId = "admob" | "applovin" | "unity" | "ironsource" | "custom";

export type BannerShowOptions = {
  /** Distance from screen bottom (px) — e.g. bottom nav clearance. */
  marginBottomPx?: number;
};

export type RewardedShowResult = {
  shown: boolean;
  rewarded: boolean;
};

/** Contract every ad network must satisfy to plug into SayItToMe. */
export interface BannerProvider {
  readonly network: AdNetworkId;
  initialize(): Promise<boolean>;
  show(options?: BannerShowOptions): Promise<boolean>;
  hide(): Promise<void>;
  remove(): Promise<void>;
  syncPosition?(marginBottomPx: number): Promise<void>;
}

export interface InterstitialProvider {
  readonly network: AdNetworkId;
  initialize(): Promise<boolean>;
  prepare(): Promise<boolean>;
  show(): Promise<boolean>;
}

export interface RewardedProvider {
  readonly network: AdNetworkId;
  initialize(): Promise<boolean>;
  prepare(): Promise<boolean>;
  show(): Promise<RewardedShowResult>;
}

export interface FeedAdContent {
  slotId: string;
  headline?: string;
  body?: string;
  cta?: string;
  advertiser?: string;
  iconUrl?: string;
}

/** Optional inline feed ads (shuffle every N profiles). */
export interface FeedAdProvider {
  readonly network: AdNetworkId;
  initialize(): Promise<boolean>;
  load(slotId: string): Promise<FeedAdContent | null>;
  recordImpression(slotId: string): Promise<void>;
  performClick(slotId: string): Promise<void>;
  destroy(slotId: string): Promise<void>;
  destroyAll(): Promise<void>;
}
