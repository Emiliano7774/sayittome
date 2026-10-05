"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { useT } from "@/contexts/LocaleContext";

import ShuffleAdSlot from "@/components/monetization/ShuffleAdSlot";
import {
  getShuffleAdSlotId,
  getShuffleFeedItemCount,
  getShuffleProfileIndex,
  isShuffleNativeAdIndex,
  shouldShowShuffleFeedAds,
} from "@/lib/shuffle/shuffleFeedAds";
import {
  getServerShuffleSlotsVersion,
  getShuffleSlotsVersion,
  getShuffleWindowGeneration,
  getVisibleShuffleProfiles,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";
import {
  getShuffleSoloOnlineFilter,
  requestClearShuffleSoloOnline,
  subscribeShuffleSoloOnlineFilter,
} from "@/lib/shuffle/shuffleOnlineFilterNotice";
import type { ShuffleProfile } from "@/lib/shuffle/types";
import { useHydrationReady } from "@/hooks/useHydrationReady";

type Props = {
  /** Used for ad slot IDs so modern and classic never share the same ad instance. */
  mode: "modern" | "classic";
  variant: "grid" | "list";
  className?: string;
  renderProfile: (profile: ShuffleProfile, profileIndex: number) => ReactNode;
};

/** Feed ad insertion every N profiles — slots render when ADS_ENABLED is true. */
export default function ShuffleFeedWithNativeAds({
  mode,
  variant,
  className,
  renderProfile,
}: Props) {
  const t = useT();
  const hydrationReady = useHydrationReady();
  const soloOnline = useSyncExternalStore(
    subscribeShuffleSoloOnlineFilter,
    getShuffleSoloOnlineFilter,
    () => false,
  );
  const slotsVersion = useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getServerShuffleSlotsVersion,
  );

  const windowGeneration = getShuffleWindowGeneration();
  const profiles =
    hydrationReady && slotsVersion > 0 ? getVisibleShuffleProfiles() : [];
  const showAds = shouldShowShuffleFeedAds(profiles.length);
  const itemCount = getShuffleFeedItemCount(profiles.length, showAds);

  return (
    <div
      className={className}
      data-shuffle-list
      data-nav-shuffle-primary
      data-stm-no-polish
      data-window-generation={windowGeneration}
    >
      {Array.from({ length: itemCount }, (_, index) => {
        if (isShuffleNativeAdIndex(index, profiles.length, showAds)) {
          return (
            <div
              key={getShuffleAdSlotId(mode, index)}
              data-shuffle-ad="1"
              className="sayittome-shuffle-ad"
            >
              <ShuffleAdSlot
                slotId={getShuffleAdSlotId(mode, index)}
                variant={variant}
              />
            </div>
          );
        }

        const profileIndex = getShuffleProfileIndex(
          index,
          profiles.length,
          showAds,
        );
        const profile = profiles[profileIndex];
        if (!profile) return null;

        return renderProfile(profile, profileIndex);
      })}
      {soloOnline && profiles.length > 0 ? (
        <div
          data-shuffle-online-filter-footer="1"
          data-shuffle-online-filter-footer-mode={mode}
          className="col-span-full flex flex-col items-center bg-black px-6 py-10 text-center [grid-column:1/-1]"
        >
          <p
            className={
              mode === "classic"
                ? "max-w-lg text-sm font-normal leading-6 text-white/40"
                : "max-w-lg text-sm font-bold leading-6 text-white/45"
            }
          >
            {t("shuffle_online_filter_footer")}
          </p>
          <button
            type="button"
            data-shuffle-online-filter-back="1"
            onClick={() => requestClearShuffleSoloOnline()}
            className={
              mode === "classic"
                ? "mt-5 rounded-full border border-[#8C84FF]/30 bg-[#8C84FF]/10 px-5 py-2.5 text-sm font-normal text-[#8C84FF]/90"
                : "mt-5 rounded-full border border-violet-500/30 bg-violet-500/10 px-5 py-2.5 text-sm font-black text-violet-200"
            }
          >
            {t("shuffle_online_filter_back")}
          </button>
        </div>
      ) : null}
      <div aria-hidden className="sayittome-nav-scroll-spacer" />
    </div>
  );
}
