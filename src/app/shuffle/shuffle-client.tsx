"use client";

import { Search, SlidersHorizontal, User } from "lucide-react";
import { useEffect } from "react";

import ClassicAnonConnectCard from "@/components/anonMatch/ClassicAnonConnectCard";
import ClassicFollowingStrip from "@/components/shuffle/ClassicFollowingStrip";
import ClassicShuffleDensityControl from "@/components/shuffle/ClassicShuffleDensityControl";
import ShuffleAdsBootstrap from "@/components/shuffle/ShuffleAdsBootstrap";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import ShuffleFiltersSheet from "@/components/shuffle/ShuffleFiltersSheet";
import ShuffleSlots from "@/components/shuffle/ShuffleSlots";
import { useFollowingProfiles } from "@/hooks/useFollowingProfiles";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useShufflePool } from "@/hooks/useShufflePool";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";
import { useT } from "@/contexts/LocaleContext";

/** Classic UX — lista congelada visualmente. */
export default function ShuffleClient() {
  const t = useT();
  const pool = useShufflePool();
  const following = useFollowingProfiles();
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);

  useEffect(() => {
    document.body.classList.add("sayittome-shuffle-route");
    return () => {
      document.body.classList.remove("sayittome-shuffle-route");
    };
  }, []);

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
            className={`flex ${tokens.searchHeight} items-center ${tokens.searchGap} ${tokens.searchRadius} bg-[#141414] px-3`}
          >
            <Search size={tokens.searchIcon} className="shrink-0 text-white/35" />

            <input
              value={pool.search}
              onChange={(e) => pool.handleSearchChange(e.target.value)}
              placeholder={t("shuffle_classic_search")}
              className={`w-full bg-transparent font-medium text-white outline-none placeholder:text-white/25 ${tokens.searchText}`}
            />
          </div>

          <ClassicFollowingStrip
            profiles={following.profiles}
            loading={following.loading}
            hasSession={following.hasSession}
          />

          <div className={`${tokens.filterMt} flex items-center ${tokens.filterGap}`}>
            <button
              type="button"
              onClick={pool.openFilters}
              className={`relative flex ${tokens.filterBtn} items-center justify-center rounded-full border border-white/10 transition active:scale-95`}
              aria-label={t("shuffle_filters_title")}
            >
              <SlidersHorizontal size={tokens.filterIcon} />
              {pool.filtersActiveCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#8C84FF]" />
              ) : null}
            </button>

            <button
              type="button"
              onClick={pool.openFilters}
              className="min-w-0 flex-1 text-left"
            >
              <h1 className={`text-white ${tokens.filterTitle}`}>{t("shuffle_filters_title")}</h1>
            </button>
          </div>

          <button
            type="button"
            onClick={pool.handleShuffleClick}
            className={`${tokens.metaMt} flex w-full items-center justify-between font-medium text-white/38 transition active:text-white/55 ${tokens.metaText}`}
          >
            <span>{t("shuffle_change_result")}</span>

            <span className="flex items-center gap-1.5">
              <User size={tokens.metaIcon} />
              {t("shuffle_people_count", {
                count: String(pool.livePeopleCount),
              })}
            </span>
          </button>

          <ClassicShuffleDensityControl className={tokens.densityMt} />

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

        {pool.loading && pool.listReady === false ? (
          <div className="flex h-[42vh] items-center justify-center">
            <p className="text-lg font-black text-white/35">{t("common_loading")}</p>
          </div>
        ) : !pool.listReady ? (
          <div className="flex h-[42vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-lg font-black text-white/35">
              {pool.poolSize > 0 && pool.visibleCount === 0 && pool.hasActiveDiscovery
                ? t("shuffle_no_profiles_filters")
                : t("shuffle_no_profiles")}
            </p>
            {pool.poolSize > 0 && pool.visibleCount === 0 && pool.hasActiveDiscovery ? (
              <button
                type="button"
                onClick={pool.clearFilters}
                className="mt-5 rounded-full border border-[#8C84FF]/30 bg-[#8C84FF]/10 px-5 py-2.5 text-sm font-black text-[#8C84FF]"
              >
                {t("shuffle_filters_clear")}
              </button>
            ) : null}
            {pool.errorText ? (
              <p className="mt-4 max-w-3xl text-white/35 font-bold">{pool.errorText}</p>
            ) : null}
          </div>
        ) : (
          <div onClick={pool.handleListClick}>
            <ShuffleSlots />
          </div>
        )}
      </section>
    </main>
  );
}
