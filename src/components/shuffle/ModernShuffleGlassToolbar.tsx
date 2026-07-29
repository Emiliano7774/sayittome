"use client";

import Link from "next/link";
import { Search, Rocket, Shuffle, SlidersHorizontal, UserRound } from "lucide-react";

import ShuffleToolbarButton from "@/components/shuffle/ShuffleToolbarButton";
import { useT } from "@/contexts/LocaleContext";

type PoolControls = {
  search: string;
  handleSearchChange: (value: string) => void;
  handleSearchFocus: () => void;
  handleSearchBlur?: () => void;
  handleSearchSubmit: () => void;
  openFilters: () => void;
  handleShuffleClick: () => void;
  filtersActiveCount: number;
};

type Props = {
  pool: PoolControls;
};

export default function ModernShuffleGlassToolbar({ pool }: Props) {
  const t = useT();

  return (
    <div className="sayittome-shuffle-toolbar sayittome-glass-bar fixed inset-x-0 z-40">
      <div className="sayittome-shuffle-toolbar-inner mx-auto flex w-full max-w-[1400px] items-center gap-3 px-[max(16px,4vw)]">
        <Search size={20} className="shrink-0 text-white/35" />
        <input
          data-shuffle-search="1"
          value={pool.search}
          onFocus={() => pool.handleSearchFocus()}
          onBlur={() => pool.handleSearchBlur?.()}
          onCompositionStart={() => pool.handleSearchFocus()}
          onChange={(e) => pool.handleSearchChange(e.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            pool.handleSearchSubmit();
          }}
          enterKeyHint="search"
          placeholder={t("shuffle_search")}
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-white outline-none placeholder:text-white/25"
        />
        <ShuffleToolbarButton
          onClick={pool.openFilters}
          ariaLabel={t("shuffle_filters_title")}
          icon={SlidersHorizontal}
          variant="nav"
          badge={
            pool.filtersActiveCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#8C84FF]" />
            ) : null
          }
        />
        <Link
          href="/settings"
          aria-label={t("nav_profile_label")}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-[#777] active:scale-95"
        >
          <UserRound size={22} strokeWidth={2.4} />
        </Link>
        <Link
          href="/boost"
          aria-label={t("boost_nav_label")}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-[#777] active:scale-95"
        >
          <Rocket size={22} strokeWidth={2.4} />
        </Link>
        <ShuffleToolbarButton
          onClick={pool.handleShuffleClick}
          ariaLabel={t("shuffle_title")}
          icon={Shuffle}
          tone="primary"
          variant="nav"
          iconClassName="translate-x-px -translate-y-px"
        />
      </div>

      <div className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-[118px] -translate-x-1/2 rounded-full bg-white/70" />
    </div>
  );
}
