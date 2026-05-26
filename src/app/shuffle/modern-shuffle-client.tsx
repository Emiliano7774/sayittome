"use client";

import Link from "next/link";
import { Search, Shuffle } from "lucide-react";
import { useSyncExternalStore } from "react";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import ModernShuffleGrid from "@/components/modern/ModernShuffleGrid";
import ModernStoriesBar from "@/components/modern/ModernStoriesBar";
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

export default function ModernShuffleClient() {
  const pool = useShufflePool();

  useSyncExternalStore(subscribeAllShuffleSlots, getShuffleSlotsVersion, getShuffleSlotsVersion);
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const visible = getVisibleShuffleProfiles();
  const onlineVisible = visible.filter((p) => p.showOnline).length;
  const withStories = getCachedStoryGroups().length;

  return (
    <main data-scroll-root className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
        <ModernPageHeader
          title="Shuffle"
          subtitle="Perfiles activos, historias recientes y gente conectada en tiempo real."
          actions={
            <>
              <Link
                href="/stories/new"
                className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black shadow-[0_0_30px_rgba(124,58,237,.35)]"
              >
                + Historia
              </Link>
              <Link
                href="/chats"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black"
              >
                Chats
              </Link>
            </>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatPill label="Perfiles" value={pool.totalLive} tone="neutral" />
          <StatPill label="Online" value={onlineVisible} tone="green" />
          <StatPill label="Con historias" value={withStories} tone="violet" />
          <StatPill label="Visibles" value={visible.length} tone="neutral" />
        </div>

        <ModernStoriesBar />

        <div className="mt-5 flex items-center gap-3 rounded-full border border-white/10 bg-[#111] px-5 py-3">
          <Search size={22} className="shrink-0 text-white/35" />
          <input
            value={pool.search}
            onChange={(e) => pool.handleSearchChange(e.target.value)}
            placeholder="Buscar perfiles..."
            className="w-full bg-transparent text-base font-bold outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={pool.handleShuffleClick}
            className="shrink-0 rounded-full bg-violet-600 p-2.5 active:scale-95"
            aria-label="Shuffle"
          >
            <Shuffle size={20} />
          </button>
        </div>

        {pool.loading && visible.length === 0 ? (
          <div className="flex h-[50vh] items-center justify-center">
            <p className="text-2xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : !pool.listReady && visible.length === 0 ? (
          <div className="flex h-[50vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-black text-white/35">No hay perfiles para mostrar.</p>
            {pool.errorText ? (
              <p className="mt-3 font-bold text-white/40">{pool.errorText}</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5" onClick={pool.handleListClick}>
            <ModernShuffleGrid />
          </div>
        )}
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
