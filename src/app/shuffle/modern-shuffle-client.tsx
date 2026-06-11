"use client";

import Link from "next/link";
import { Search, Rocket, Shuffle, SlidersHorizontal } from "lucide-react";
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
import ShuffleToolbarButton from "@/components/shuffle/ShuffleToolbarButton";
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
import { useT } from "@/contexts/LocaleContext";

export default function ModernShuffleClient() {
  const t = useT();
  const pool = useShufflePool();
  const { totalUnread } = useChatAlerts();

  useEffect(() => {
    document.body.classList.add("sayittome-shuffle-route");
    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, []);

  useSyncExternalStore(subscribeAllShuffleSlots, getShuffleSlotsVersion, getShuffleSlotsVersion);
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const visible = getVisibleShuffleProfiles();
  const withStories = getCachedStoryGroups().length;
  const profileCount = pool.profilesCreated || pool.livePeopleCount;
  const filtersBlockResults =
    pool.poolSize > 0 && pool.visibleCount === 0 && pool.hasActiveDiscovery;

  return (
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

      <div className="sayittome-shuffle-toolbar fixed inset-x-0 z-40 border-t border-white/10 bg-black/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 rounded-full border border-white/10 bg-[#111] px-4 py-2.5">
          <Search size={20} className="shrink-0 text-white/35" />
          <input
            value={pool.search}
            onChange={(e) => pool.handleSearchChange(e.target.value)}
            placeholder={t("shuffle_search")}
            className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-white/30"
          />
          <ShuffleToolbarButton
            onClick={pool.openFilters}
            ariaLabel={t("shuffle_filters_title")}
            icon={SlidersHorizontal}
            badge={
              pool.filtersActiveCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-violet-500" />
              ) : null
            }
          />
          <Link
            href="/boost"
            aria-label={t("boost_nav_label")}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-amber-400 active:scale-95"
          >
            <Rocket size={18} strokeWidth={2.35} />
          </Link>
          <ShuffleToolbarButton
            onClick={pool.handleShuffleClick}
            ariaLabel={t("shuffle_title")}
            icon={Shuffle}
            tone="primary"
            iconClassName="translate-x-px -translate-y-px"
          />
        </div>
      </div>
    </main>
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
