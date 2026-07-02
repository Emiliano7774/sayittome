"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import ModernShuffleGrid from "@/components/modern/ModernShuffleGrid";
import ModernStoriesBar from "@/components/modern/ModernStoriesBar";
import ModernAnonConnectCard from "@/components/anonMatch/ModernAnonConnectCard";
import ChatPendingIndicator from "@/components/chat/ChatPendingIndicator";
import ShuffleAdsBootstrap from "@/components/shuffle/ShuffleAdsBootstrap";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import ShuffleFiltersEmptyState from "@/components/shuffle/ShuffleFiltersEmptyState";
import ShuffleFiltersSheet from "@/components/shuffle/ShuffleFiltersSheet";
import ModernShuffleGlassToolbar from "@/components/shuffle/ModernShuffleGlassToolbar";
import { useShufflePool } from "@/hooks/useShufflePool";
import {
  getShuffleSlotsVersion,
  getVisibleShuffleProfiles,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";
import {
  getCachedStoryGroups,
  getStoriesIndexVersion,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import { useMainTabRouteActive } from "@/contexts/MainTabShellContext";
import { useT } from "@/contexts/LocaleContext";

export default function ModernShuffleClient() {
  const shuffleActive = useMainTabRouteActive("/shuffle");
  const t = useT();
  const pool = useShufflePool();
  const { totalUnread } = useChatAlerts();

  useEffect(() => {
    if (!shuffleActive) return;
    document.body.classList.add("sayittome-shuffle-route");
    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, [shuffleActive]);

  useSyncExternalStore(subscribeAllShuffleSlots, getShuffleSlotsVersion, getShuffleSlotsVersion);
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const visible = getVisibleShuffleProfiles();
  const withStories = getCachedStoryGroups().length;
  const profileCount = pool.profilesCreated || pool.livePeopleCount;
  const filtersBlockResults =
    pool.poolSize > 0 && pool.visibleCount === 0 && pool.hasActiveDiscovery;

  return (
    <>
    <main data-scroll-root className="sayittome-shuffle-scroll min-h-screen bg-black text-white">
      <ShuffleAdsBootstrap />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
        <ModernPageHeader
          title={t("shuffle_title")}
          subtitle={t("shuffle_subtitle")}
          actions={
            <>
              <Link
                href="/stories/new"
                className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black shadow-[0_0_30px_rgba(124,58,237,.35)]"
              >
                {t("shuffle_new_story")}
              </Link>
              <Link
                href="/chats"
                className="relative rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black"
              >
                {t("chats_title")}
                {totalUnread > 0 ? (
                  <ChatPendingIndicator className="-right-0.5 -top-0.5" />
                ) : null}
              </Link>
            </>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatPill label={t("shuffle_profiles")} value={profileCount} tone="neutral" />
          <StatPill label={t("shuffle_online")} value={pool.filteredOnlineCount} tone="green" />
          <StatPill label={t("shuffle_stories")} value={withStories} tone="violet" />
          <StatPill label={t("shuffle_visible")} value={visible.length} tone="neutral" />
        </div>

        <ModernStoriesBar />

        <ModernAnonConnectCard />

        <ShuffleFiltersSheet
          open={pool.filtersOpen}
          applied={pool.filters}
          variant="modern"
          onClose={pool.closeFilters}
          onApply={pool.applyFilters}
          onClear={pool.clearFilters}
        />

        {pool.loading && visible.length === 0 ? (
          <div className="flex h-[50vh] items-center justify-center">
            <p className="text-2xl font-black text-white/35">{t("common_loading")}</p>
          </div>
        ) : !pool.listReady && visible.length === 0 ? (
          filtersBlockResults ? (
            <ShuffleFiltersEmptyState
              variant="modern"
              soloOnline={pool.filters.soloOnline}
              onClearFilters={pool.clearFilters}
              onKeepTrying={pool.handleShuffleClick}
              errorText={pool.errorText}
            />
          ) : (
            <div className="flex h-[50vh] flex-col items-center justify-center text-center">
              <p className="text-2xl font-black text-white/35">{t("shuffle_no_profiles")}</p>
              {pool.errorText ? (
                <p className="mt-3 font-bold text-white/40">{pool.errorText}</p>
              ) : null}
            </div>
          )
        ) : (
          <div className="mt-5" onClick={pool.handleListClick}>
            <ModernShuffleGrid />
          </div>
        )}
      </div>
    </main>

    <ModernShuffleGlassToolbar pool={pool} />
    </>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "violet" | "neutral";
}) {
  const toneClass =
    tone === "green"
      ? "border-green-500/25 bg-green-500/10 text-green-300"
      : tone === "violet"
        ? "border-violet-500/25 bg-violet-500/10 text-violet-200"
        : "border-white/10 bg-white/[0.03] text-white/70";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-black tracking-[0.14em] opacity-80">{label}</p>
    </div>
  );
}
