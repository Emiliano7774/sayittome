"use client";

import { Search, SlidersHorizontal, User } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import ClassicAnonConnectCard from "@/components/anonMatch/ClassicAnonConnectCard";
import ClassicFollowingStrip from "@/components/shuffle/ClassicFollowingStrip";
import ClassicShuffleDensityControl from "@/components/shuffle/ClassicShuffleDensityControl";
import ShuffleAdsBootstrap from "@/components/shuffle/ShuffleAdsBootstrap";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import ShuffleFiltersEmptyState from "@/components/shuffle/ShuffleFiltersEmptyState";
import ShuffleFiltersSheet from "@/components/shuffle/ShuffleFiltersSheet";
import ShuffleSlots from "@/components/shuffle/ShuffleSlots";
import { useFollowingProfiles } from "@/hooks/useFollowingProfiles";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useShufflePool } from "@/hooks/useShufflePool";
import { traceLoadingShellPresentation, traceShuffleVisualCommit } from "@/lib/shuffle/shuffleWarmVisual";
import {
  deriveShufflePresentation,
  deriveShuffleSurfaceMode,
} from "@/lib/shuffle/shufflePresentation";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";
import { getClassicShuffleHeaderUi } from "@/lib/shuffle/classicHeaderUi";
import { setShuffleExcludeProfiles } from "@/lib/shuffle/shuffleExcludeStore";
import {
  getVisibleShuffleProfiles,
  getServerShuffleSlotsVersion,
  getShuffleSlotsVersion,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";
import { restorePinnedShuffleWindowSync } from "@/lib/shuffle/shufflePinnedWindow";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { useMainTabRouteActive } from "@/contexts/MainTabShellContext";
import { isShuffleKeepAliveActive } from "@/lib/navigation/shuffleKeepAlive";
import { isShuffleRevealDeferred, isShuffleSurfacePresented } from "@/lib/navigation/shuffleHandoffState";
import { useT } from "@/contexts/LocaleContext";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { useHydrationReady } from "@/hooks/useHydrationReady";

/** Classic UX — lista congelada visualmente. */
export default function ShuffleClient() {
  const shuffleActive = useMainTabRouteActive("/shuffle");
  const t = useT();
  const pool = useShufflePool();
  const hydrationReady = useHydrationReady();
  const following = useFollowingProfiles();
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);
  const headerUi = getClassicShuffleHeaderUi(density);
  const followingExcludeSigRef = useRef("");

  useEffect(() => {
    if (!shuffleActive) return;
    if (isShuffleKeepAliveActive() && !isShuffleSurfacePresented()) return;
    releaseChatViewportLock();
    document.body.classList.add("sayittome-shuffle-route");
    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, [shuffleActive]);

  useEffect(() => {
    const sig = following.profiles
      .map((profile) => profile.uid)
      .sort()
      .join("|");
    if (sig === followingExcludeSigRef.current) return;
    followingExcludeSigRef.current = sig;
    setShuffleExcludeProfiles(following.profiles);
  }, [following.profiles]);

  const slotsVersion = useSyncExternalStore(
    subscribeAllShuffleSlots,
    getShuffleSlotsVersion,
    getServerShuffleSlotsVersion,
  );

  useLayoutEffect(() => {
    if (isShuffleRevealDeferred()) {
      restorePinnedShuffleWindowSync();
    }
  });

  const visibleCount =
    hydrationReady && slotsVersion > 0 ? getVisibleShuffleProfiles().length : 0;
  const gateInput = {
    loading: pool.loading,
    listReady: pool.listReady,
    visibleCount,
    poolProfileCount: pool.poolSize,
    hydrationReady,
  };
  const presentation = deriveShufflePresentation(gateInput);
  const { showShuffleLoading, showShuffleFeed } = presentation;
  const surfaceMode = deriveShuffleSurfaceMode({
    showShuffleLoading,
    showShuffleFeed,
    poolSize: pool.poolSize,
    filteredVisibleCount: pool.visibleCount,
    hasActiveDiscovery: pool.hasActiveDiscovery,
  });

  useLayoutEffect(() => {
    traceLoadingShellPresentation(showShuffleLoading, gateInput);
    traceShuffleVisualCommit("classic-shuffle-render", {
      showLoadingShell: showShuffleLoading,
      visibleCount,
      listReady: pool.listReady,
    });
  });

  useNavUsefulPaint(shuffleActive && showShuffleFeed && !showShuffleLoading);

  return (
    <main
      data-scroll-root
      className="sayittome-shuffle-scroll-classic min-h-screen bg-black text-white"
    >
      <ShuffleAdsBootstrap />
      <section className="w-full px-4 md:px-8">
        <ClassicUxModeBar className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-2" />

        <div className={`border-b border-white/10 ${tokens.headerPb} ${tokens.headerPt}`}>
          <div
            className="flex items-center bg-[#141414]"
            style={{
              height: headerUi.searchHeightPx,
              gap: headerUi.searchPadXPx / 3,
              paddingInline: headerUi.searchPadXPx,
              borderRadius: headerUi.searchRadiusPx,
            }}
          >
            <Search size={headerUi.searchIconPx} className="shrink-0 text-white/35" />
            <input
              data-shuffle-search="1"
              value={pool.search}
              onFocus={() => pool.handleSearchFocus()}
              onBlur={() => pool.handleSearchBlur()}
              onCompositionStart={() => pool.handleSearchFocus()}
              onChange={(e) => pool.handleSearchChange(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                pool.handleSearchSubmit();
              }}
              enterKeyHint="search"
              placeholder={t("shuffle_classic_search")}
              className="w-full bg-transparent font-medium text-white outline-none placeholder:text-white/25"
              style={{ fontSize: headerUi.searchTextPx }}
            />
          </div>

          <ClassicFollowingStrip
            profiles={following.profiles}
            loading={following.loading}
            hasSession={following.hasSession}
            authPending={following.authPending}
            showGuest={following.showGuest}
            state={following.state}
          />

          <div
            className="flex items-center"
            style={{ marginTop: headerUi.filterMtPx, gap: headerUi.followingGapPx }}
          >
            <button
              type="button"
              onClick={pool.openFilters}
              className="relative shrink-0 text-white/70 transition active:scale-95 active:text-white"
              aria-label={t("shuffle_filters_title")}
            >
              <SlidersHorizontal size={headerUi.filterIconPx} />
              {pool.filtersActiveCount > 0 ? (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#8C84FF]" />
              ) : null}
            </button>

            <button type="button" onClick={pool.openFilters} className="min-w-0 flex-1 text-left">
              <h1
                className="font-normal tracking-[-0.03em] text-white/55"
                style={{ fontSize: headerUi.filterTitlePx }}
              >
                {t("shuffle_filters_title")}
              </h1>
            </button>
          </div>

          <div
            className="flex flex-col"
            style={{
              marginTop: headerUi.metaMtPx,
              gap: headerUi.metaDensityGapPx,
            }}
          >
            <button
              type="button"
              onClick={pool.handleShuffleClick}
              className="flex w-full items-center justify-between font-medium text-white/38 transition active:text-white/55"
              style={{ fontSize: headerUi.metaTextPx }}
            >
              <span>{t("shuffle_change_result")}</span>
              <span className="flex items-center gap-1.5">
                <User size={headerUi.metaIconPx} />
                {hydrationReady
                  ? t("shuffle_people_count", {
                      count: String(pool.livePeopleCount),
                    })
                  : t("shuffle_people_count", { count: "0" })}
              </span>
            </button>

            <ClassicShuffleDensityControl />
          </div>

          <ClassicAnonConnectCard />
        </div>

        <ShuffleFiltersSheet
          open={pool.filtersOpen}
          applied={pool.filters}
          variant="classic"
          onClose={pool.closeFilters}
          onApply={pool.applyFilters}
          onClear={pool.clearFilters}
        />

        {surfaceMode === "loading" ? (
          <div className="flex h-[42vh] items-center justify-center" data-loading-shell>
            <p className="text-lg font-normal text-white/35">{t("common_loading")}</p>
          </div>
        ) : surfaceMode === "filters-empty" ? (
          <ShuffleFiltersEmptyState
            variant="classic"
            soloOnline={pool.filters.soloOnline}
            onClearFilters={pool.clearFilters}
            onKeepTrying={pool.handleShuffleClick}
            errorText={pool.errorText}
          />
        ) : surfaceMode === "feed" ? (
          <div onClick={pool.handleListClick}>
            <ShuffleSlots />
          </div>
        ) : (
          <div className="flex h-[42vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-lg font-normal text-white/35">{t("shuffle_no_profiles")}</p>
            {pool.errorText ? (
              <p className="mt-4 max-w-3xl font-normal text-white/35">{pool.errorText}</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
