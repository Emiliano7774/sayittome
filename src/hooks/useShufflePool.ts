"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { normalizeShuffleProfiles } from "@/lib/shuffle/normalize";
import { refreshPoolPresence } from "@/lib/shuffle/refreshPresence";
import {
  pickRandomWindowIndices,
  SHUFFLE_WINDOW_SIZE,
} from "@/lib/shuffle/pickWindow";
import {
  attachShuffleProfilerWindow,
  shuffleCount,
  shuffleDump,
  shuffleMark,
  shuffleMeasure,
} from "@/lib/shuffle/shuffleProfiler";
import { setShuffleSlots } from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";
import { warmShuffleImages } from "@/lib/shuffle/warmImages";
import { refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";

export function useShufflePool() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [listReady, setListReady] = useState(false);

  const mountedRef = useRef(false);
  const poolRef = useRef<ShuffleProfile[]>([]);
  const activePoolRef = useRef<ShuffleProfile[]>([]);
  const totalLiveRef = useRef(0);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const loadLockedRef = useRef(false);
  const scratchIndicesRef = useRef<number[]>([]);
  const windowIndicesRef = useRef(new Int32Array(SHUFFLE_WINDOW_SIZE));
  const windowCountRef = useRef(0);
  const shuffleClickCountRef = useRef(0);

  const applyWindowFromPool = useCallback((pool: ShuffleProfile[]) => {
    const len = pool.length;
    if (len === 0) return;

    windowCountRef.current = pickRandomWindowIndices(
      len,
      scratchIndicesRef.current,
      windowIndicesRef.current,
    );

    setShuffleSlots(
      refreshPoolPresence(pool),
      windowIndicesRef.current,
      windowCountRef.current,
    );
    setListReady(true);
  }, []);

  const applyPool = useCallback(
    (profiles: ShuffleProfile[], total: number) => {
      if (profiles.length === 0) return;

      poolRef.current = profiles;
      activePoolRef.current = profiles;

      if (total > 0) totalLiveRef.current = total;

      setTotalLive(total > 0 ? total : profiles.length);
      setLoading(false);
      setErrorText("");
      warmShuffleImages(profiles);
      applyWindowFromPool(profiles);
    },
    [applyWindowFromPool],
  );

  const filterActivePool = useCallback(
    (needle: string) => {
      const q = needle.trim().toLowerCase();
      if (!q) {
        activePoolRef.current = poolRef.current;
      } else {
        activePoolRef.current = poolRef.current.filter((p) => {
          return (
            String(p.username || "").toLowerCase().includes(q) ||
            String(p.bio || "").toLowerCase().includes(q)
          );
        });
      }

      applyWindowFromPool(activePoolRef.current);
    },
    [applyWindowFromPool],
  );

  const loadProfiles = useCallback(
    async ({ q = "", force = false }: { q?: string; force?: boolean }) => {
      if (loadLockedRef.current && !force) return;

      loadLockedRef.current = true;

      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const timeout = window.setTimeout(() => controller.abort(), 12000);

      if (mountedRef.current && poolRef.current.length === 0) {
        setLoading(true);
        setErrorText("");
      }

      try {
        const params = new URLSearchParams({
          limit: "500",
          shuffle: "0",
          q,
          ts: String(Date.now()),
        });

        const res = await fetch(`/api/shuffle?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();

        if (!mountedRef.current || requestSeq !== requestSeqRef.current) return;

        const nextProfiles = normalizeShuffleProfiles(json?.profiles);
        const profilesCreated = Number(json?.profilesCreated ?? 0);
        const total = Number(
          json?.totalLive ?? json?.profilesCreated ?? nextProfiles.length,
        );

        if (nextProfiles.length > 0) {
          applyPool(nextProfiles, total || profilesCreated || nextProfiles.length);
          if (q) filterActivePool(q);
        } else if (poolRef.current.length > 0) {
          if (q) filterActivePool(q);
          else applyPool(poolRef.current, totalLiveRef.current);
        } else {
          setLoading(false);
        }

        if (json?.ok === false && json?.error) {
          setErrorText(String(json.error));
        }
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          console.error(error);
          if (mountedRef.current && poolRef.current.length === 0) {
            setErrorText((error as Error)?.message || "Error cargando perfiles");
            setLoading(false);
          }
        }
      } finally {
        window.clearTimeout(timeout);
        loadLockedRef.current = false;
        if (mountedRef.current && requestSeq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [applyPool, filterActivePool],
  );

  const handleShuffleClick = useCallback((event?: React.MouseEvent | Event) => {
    shuffleMark("shuffle-click-start");
    shuffleCount("shuffleClicks");

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const pool = activePoolRef.current;
    if (pool.length > 0) {
      const len = pool.length;
      windowCountRef.current = pickRandomWindowIndices(
        len,
        scratchIndicesRef.current,
        windowIndicesRef.current,
      );
      setShuffleSlots(
        refreshPoolPresence(pool),
        windowIndicesRef.current,
        windowCountRef.current,
      );
    }

    shuffleClickCountRef.current += 1;
    if (shuffleClickCountRef.current % 40 === 0) {
      shuffleDump("shuffle-spam");
    }

    shuffleMark("shuffle-click-end");
    shuffleMeasure("shuffle-click", "shuffle-click-start", "shuffle-click-end");
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      filterActivePool(value);

      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

      const q = value.trim();
      if (!q) return;

      searchTimerRef.current = window.setTimeout(() => {
        loadProfiles({ q, force: true });
      }, 550);
    },
    [filterActivePool, loadProfiles],
  );

  const handleListClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-action][data-username]",
      );
      if (!target) return;

      const action = target.getAttribute("data-action");
      const username = target.getAttribute("data-username");
      if (!username) return;

      if (action === "story") {
        const ownerUid = target.getAttribute("data-owner-uid");
        router.push(`/stories/${encodeURIComponent(ownerUid || username)}`);
      } else if (action === "profile") {
        router.push(`/u/${encodeURIComponent(username)}`);
      } else if (action === "chat") {
        router.push(`/u/${encodeURIComponent(username)}/chat`);
      }
    },
    [router],
  );

  useEffect(() => {
    mountedRef.current = true;
    attachShuffleProfilerWindow();
    document.body.classList.remove("sayittome-chat-open");

    loadProfiles({ q: "", force: true });

    const scheduleStoriesIndex = () => {
      const run = () => refreshStoriesIndex("", false).catch(() => {});
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 3000 });
      } else {
        window.setTimeout(run, 0);
      }
    };
    scheduleStoriesIndex();

    function onShuffleEvent(event: Event) {
      handleShuffleClick(event);
    }

    window.addEventListener("sayittome:shuffle", onShuffleEvent);

    const presenceTimer = window.setInterval(() => {
      if (poolRef.current.length === 0) return;

      poolRef.current = refreshPoolPresence(poolRef.current);
      activePoolRef.current = refreshPoolPresence(activePoolRef.current);

      if (windowCountRef.current > 0 && activePoolRef.current.length > 0) {
        setShuffleSlots(
          activePoolRef.current,
          windowIndicesRef.current,
          windowCountRef.current,
        );
      }
    }, 45_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(presenceTimer);
      window.removeEventListener("sayittome:shuffle", onShuffleEvent);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      abortRef.current?.abort();
    };
  }, [handleShuffleClick, loadProfiles]);

  const onlineCount = activePoolRef.current.filter((p) => p.showOnline).length;

  return {
    search,
    totalLive,
    loading,
    errorText,
    listReady,
    onlineCount,
    poolSize: poolRef.current.length,
    handleSearchChange,
    handleShuffleClick,
    handleListClick,
  };
}
