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
        <p
          data-shuffle-online-filter-footer="1"
          className="col-span-full mt-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-[13px] font-semibold leading-5 text-white/55 [grid-column:1/-1]"
        >
          {t("shuffle_online_filter_footer")}
        </p>
      ) : null}
      <div aria-hidden className="sayittome-nav-scroll-spacer" />
    </div>
  );
}
