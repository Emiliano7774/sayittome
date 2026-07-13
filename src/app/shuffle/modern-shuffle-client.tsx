"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import NativeAwareLink from "@/components/navigation/NativeAwareLink";
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
  traceShuffleVisualCommit,
} from "@/lib/shuffle/shuffleWarmVisual";
import { deriveShufflePresentation } from "@/lib/shuffle/shufflePresentation";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { useMainTabRouteActive } from "@/contexts/MainTabShellContext";
import { isShuffleKeepAliveActive } from "@/lib/navigation/shuffleKeepAlive";
import { isShuffleRevealDeferred, isShuffleSurfacePresented } from "@/lib/navigation/shuffleHandoffState";
import { useT } from "@/contexts/LocaleContext";
import {
  getCachedStoryGroups,
  getStoriesIndexVersion,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";

export default function ModernShuffleClient() {
  const shuffleActive = useMainTabRouteActive("/shuffle");
  const t = useT();
  const pool = useShufflePool();
  const { totalUnread } = useChatAlerts();

  useEffect(() => {
    if (!shuffleActive) return;
    if (isShuffleKeepAliveActive() && !isShuffleSurfacePresented()) return;
    releaseChatViewportLock();
    document.body.classList.add("sayittome-shuffle-route");
    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, [shuffleActive]);

  useSyncExternalStore(subscribeAllShuffleSlots, getShuffleSlotsVersion, getShuffleSlotsVersion);
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  useLayoutEffect(() => {
    if (isShuffleRevealDeferred()) {
      restorePinnedShuffleWindowSync();
    }
  });

  const visible = getVisibleShuffleProfiles();
  const withStories = getCachedStoryGroups().length;
  const profileCount = pool.profilesCreated || pool.livePeopleCount;
  const filtersBlockResults =
    pool.poolSize > 0 && pool.visibleCount === 0 && pool.hasActiveDiscovery;
  const gateInput = {
    loading: pool.loading,
    listReady: pool.listReady,
    visibleCount: visible.length,
    poolProfileCount: pool.poolSize,
  };
  const presentation = deriveShufflePresentation(gateInput);
  const { showShuffleLoading, showShuffleFeed } = presentation;

  useLayoutEffect(() => {
    traceShuffleVisualCommit("modern-shuffle-render", {
      showLoadingShell: showShuffleLoading,
      visibleCount: visible.length,
      listReady: pool.listReady,
    });
  });

  useNavUsefulPaint(shuffleActive && visible.length > 0 && !showShuffleLoading, "/shuffle");

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
              <NativeAwareLink
                href="/stories/new"
                className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black shadow-[0_0_30px_rgba(124,58,237,.35)]"
              >
                {t("shuffle_new_story")}
              </NativeAwareLink>
              <NativeAwareLink
                href="/chats"
                className="relative rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black"
              >
                {t("chats_title")}
                {totalUnread > 0 ? (
                  <ChatPendingIndicator className="-right-0.5 -top-0.5" />
                ) : null}
              </NativeAwareLink>
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

        {showShuffleLoading ? (
          <div
            className="flex h-[50vh] items-center justify-center"
            data-loading-shell
          >
            <p className="text-2xl font-black text-white/35">{t("common_loading")}</p>
          </div>
        ) : showShuffleFeed ? (
          <div className="mt-5" onClick={pool.handleListClick}>
            <ModernShuffleGrid />
          </div>
        ) : filtersBlockResults ? (
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
