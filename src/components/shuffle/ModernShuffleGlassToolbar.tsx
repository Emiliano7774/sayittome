"use client";

import Link from "next/link";
import { Search, Rocket, Shuffle, SlidersHorizontal, UserRound } from "lucide-react";

import ShuffleToolbarButton from "@/components/shuffle/ShuffleToolbarButton";
import { useShuffleGlassShift } from "@/hooks/useShuffleGlassShift";
import { useT } from "@/contexts/LocaleContext";

type PoolControls = {
  search: string;
  handleSearchChange: (value: string) => void;
  openFilters: () => void;
  handleShuffleClick: () => void;
  filtersActiveCount: number;
};

type Props = {
  pool: PoolControls;
};

export default function ModernShuffleGlassToolbar({ pool }: Props) {
  const t = useT();
  const glassShift = useShuffleGlassShift(true);

  return (
    <div
      className="sayittome-shuffle-toolbar sayittome-shuffle-toolbar-glass fixed inset-x-0 z-40 px-4 py-3"
      style={{ ["--shuffle-glass-shift" as string]: String(glassShift) }}
    >
      <div aria-hidden className="sayittome-shuffle-toolbar-glass-backlights">
        <span className="sayittome-shuffle-toolbar-glass-blob sayittome-shuffle-toolbar-glass-blob-a" />
        <span className="sayittome-shuffle-toolbar-glass-blob sayittome-shuffle-toolbar-glass-blob-b" />
        <span className="sayittome-shuffle-toolbar-glass-blob sayittome-shuffle-toolbar-glass-blob-c" />
      </div>
      <div className="sayittome-shuffle-toolbar-glass-outer mx-auto w-full max-w-[1400px]">
        <div className="sayittome-shuffle-toolbar-pill relative flex items-center gap-3 px-4 py-2.5">
          <span aria-hidden className="sayittome-shuffle-toolbar-pill-lights" />
          <Search size={20} className="relative z-[1] shrink-0 text-white/50" />
          <input
            value={pool.search}
            onChange={(e) => pool.handleSearchChange(e.target.value)}
            placeholder={t("shuffle_search")}
            className="relative z-[1] min-w-0 flex-1 bg-transparent text-base font-bold text-white outline-none placeholder:text-white/35"
          />
          <ShuffleToolbarButton
            onClick={pool.openFilters}
            ariaLabel={t("shuffle_filters_title")}
            icon={SlidersHorizontal}
            variant="glass"
            badge={
              pool.filtersActiveCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" />
              ) : null
            }
          />
          <Link
            href="/settings"
            aria-label={t("nav_profile_label")}
            className="sayittome-shuffle-glass-chip relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-violet-200 active:scale-95"
          >
            <UserRound size={18} strokeWidth={2.35} />
          </Link>
          <Link
            href="/boost"
            aria-label={t("boost_nav_label")}
            className="sayittome-shuffle-glass-chip relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-300 active:scale-95"
          >
            <Rocket size={18} strokeWidth={2.35} />
          </Link>
          <ShuffleToolbarButton
            onClick={pool.handleShuffleClick}
            ariaLabel={t("shuffle_title")}
            icon={Shuffle}
            tone="primary"
            variant="glass"
            iconClassName="translate-x-px -translate-y-px"
          />
        </div>
      </div>
    </div>
  );
}
