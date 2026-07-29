"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  dedupeShuffleProfiles,
  profileMatchesShuffleExcludeKeys,
  shuffleProfileBatchExcludeKeys,
  shuffleProfileDedupeKeys,
  uniqueShuffleWindow,
} from "@/lib/shuffle/dedupeProfiles";
import { getShuffleExcludeKeys, subscribeShuffleExclude } from "@/lib/shuffle/shuffleExcludeStore";
import { normalizeShuffleProfiles } from "@/lib/shuffle/normalize";
import { isPublicShuffleOnline } from "@/lib/profile/lastSeenVisibility";
import { isShuffleProfileOnline } from "@/lib/presence";
import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { getStoryViewerKey } from "@/lib/stories/storyAuthor";
import {
  defaultShuffleFilters,
  loadStoredShuffleFilters,
  profileMatchesShuffleFilters,
  profileMatchesShuffleSearch,
  saveStoredShuffleFilters,
  shuffleFiltersActiveCount,
  type ShuffleFilters,
} from "@/lib/shuffle/filters";
import { refreshPoolPresence } from "@/lib/shuffle/refreshPresence";
import { applyShuffleProfileBlurFlags, mergeShuffleProfileModeration } from "@/lib/shuffle/resolveShuffleBlur";
import {
  pickRandomUniqueWindowIndices,
  SHUFFLE_BATCH_MEMORY,
  SHUFFLE_WINDOW_SIZE,
} from "@/lib/shuffle/pickWindow";
import {
  attachShuffleProfilerWindow,
  shuffleCount,
  shuffleDump,
  shuffleMark,
  shuffleMeasure,
} from "@/lib/shuffle/shuffleProfiler";
import {
  patchShuffleSlotPresence,
  setShuffleSlotsWithFeatured,
  getVisibleShuffleProfiles,
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";
import {
  deferShuffleCountOnlyIfTyping,
  deferShufflePoolLoadIfTyping,
  markShuffleSearchTypingActive,
  registerShuffleSearchTypingFlushers,
  unregisterShuffleSearchTypingFlushers,
} from "@/lib/shuffle/shuffleSearchTypingGuard";
import { registerShuffleClickHandler } from "@/lib/shuffle/shuffleClickBridge";
import { warmShuffleImages } from "@/lib/shuffle/warmImages";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { scrollShuffleFeedToTop } from "@/lib/shuffle/scrollShuffleFeed";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { stashProfileReturnTo } from "@/lib/navigation/profileReturnNav";
import { stashStoryReturnTo } from "@/lib/navigation/storyReturnNav";
import { isShufflePoolWarmForNav } from "@/lib/shuffle/shufflePoolWarmup";
import {
  readCachedShufflePool,
  readCachedShuffleStats,
  writeCachedShufflePool,
  writeCachedShuffleStats,
} from "@/lib/shuffle/shuffleClientCache";
import {
  getCachedStoryGroups,
  getStoriesIndexVersion,
  refreshStoriesIndex,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import { markShuffleHydrated, hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import {
  capturePinnedShuffleWindow,
  peekPinnedShuffleWindowCount,
  restorePinnedShuffleWindowSync,
} from "@/lib/shuffle/shufflePinnedWindow";
import {
  isShuffleFeedFrozen,
  releaseShuffleWindowRefreshSuppression,
  shouldSuppressShuffleWindowRefresh,
} from "@/lib/navigation/shuffleKeepAlive";
import { isShuffleRevealDeferred } from "@/lib/navigation/shuffleHandoffState";

function readInitialShuffleState() {
  const cachedProfiles = readCachedShufflePool() ?? [];
  const cachedStats = readCachedShuffleStats();
  const visible = getVisibleShuffleProfiles();
  const pinnedCount = peekPinnedShuffleWindowCount();
  const warmRestorable =
    visible.length >= 3 ||
    cachedProfiles.length >= 3 ||
    pinnedCount >= 3 ||
    hasShuffleEverHydrated();
  const hasContent = cachedProfiles.length > 0 || visible.length > 0 || warmRestorable;

  return {
    cachedProfiles,
    cachedStats,
    loading: !hasContent,
    listReady: hasContent,
    visibleCount: visible.length,
  };
}

export function useShufflePool() {
  const router = useRouter();
  const pathname = usePathname();
  const shuffleFeedFrozen = isShuffleFeedFrozen(pathname);
  const shuffleFeedFrozenRef = useRef(shuffleFeedFrozen);
  shuffleFeedFrozenRef.current = shuffleFeedFrozen;
  const prevShuffleFrozenRef = useRef(shuffleFeedFrozen);
  const initialShuffleRef = useRef<ReturnType<typeof readInitialShuffleState> | null>(null);
  if (!initialShuffleRef.current) {
    initialShuffleRef.current = readInitialShuffleState();
  }
  const initialShuffle = initialShuffleRef.current;

  const [search, setSearch] = useState("");
  const [totalLive, setTotalLive] = useState(
    () => initialShuffle.cachedStats?.totalLive ?? 0,
  );
  const [profilesCreated, setProfilesCreated] = useState(
    () => initialShuffle.cachedStats?.profilesCreated ?? 0,
  );
  const [anonymousOnline, setAnonymousOnline] = useState(
    () => initialShuffle.cachedStats?.anonymousOnline ?? 0,
  );
  const [livePeopleCount, setLivePeopleCount] = useState(
    () => initialShuffle.cachedStats?.totalLive ?? 0,
  );
  const [loading, setLoading] = useState(() => initialShuffle.loading);
  const [errorText, setErrorText] = useState("");
  const [listReady, setListReady] = useState(() => initialShuffle.listReady);
  const [filters, setFiltersState] = useState<ShuffleFilters>(() => loadStoredShuffleFilters());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filteredCount, setFilteredCount] = useState(0);
  const [filteredOnlineCount, setFilteredOnlineCount] = useState(0);

  const filtersRef = useRef<ShuffleFilters>(loadStoredShuffleFilters());
  const searchRef = useRef("");
  const storyOwnerUidsRef = useRef<Set<string>>(new Set());
  const poolRef = useRef<ShuffleProfile[]>(
    initialShuffle.cachedProfiles.length > 0
      ? dedupeShuffleProfiles(initialShuffle.cachedProfiles)
      : [],
  );
  const activePoolRef = useRef<ShuffleProfile[]>(poolRef.current);
  const totalLiveRef = useRef(initialShuffle.cachedStats?.totalLive ?? 0);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const loadLockedRef = useRef(false);
  const scratchIndicesRef = useRef<number[]>([]);
  const windowIndicesRef = useRef(new Int32Array(SHUFFLE_WINDOW_SIZE));
  const windowCountRef = useRef(0);
  const featuredRef = useRef<ShuffleProfile[]>([]);
  const shuffleClickCountRef = useRef(0);
  const recentBatchKeysQueueRef = useRef<Set<string>[]>([]);
  const mountedRef = useRef(false);

  function windowSignature(profiles: ShuffleProfile[]) {
    return profiles
      .map((profile) => profile.uid || profile.username)
      .sort()
      .join("|");
  }

  function keysFromProfiles(profiles: ShuffleProfile[]) {
    const keys = new Set<string>();
    for (const profile of profiles) {
      for (const key of shuffleProfileBatchExcludeKeys(profile)) {
        keys.add(key);
      }
    }
    return keys;
  }

  function clearBatchMemory() {
    recentBatchKeysQueueRef.current = [];
  }

  function pushBatchMemory(profiles: ShuffleProfile[]) {
    const batchKeys = keysFromProfiles(profiles);
    if (batchKeys.size === 0) return;

    const queue = recentBatchKeysQueueRef.current;
    queue.push(batchKeys);
    while (queue.length > SHUFFLE_BATCH_MEMORY) {
      queue.shift();
    }
  }

  function replaceLatestBatchMemory(profiles: ShuffleProfile[]) {
    const batchKeys = keysFromProfiles(profiles);
    const queue = recentBatchKeysQueueRef.current;
    if (queue.length === 0) {
      pushBatchMemory(profiles);
      return;
    }
    queue[queue.length - 1] = batchKeys;
  }

  function rememberBatchMemory(
    profiles: ShuffleProfile[],
    options: { shuffleRound?: boolean; resetBatchMemory?: boolean },
  ) {
    if (options.resetBatchMemory) {
      clearBatchMemory();
      pushBatchMemory(profiles);
      return;
    }

    if (options.shuffleRound) {
      pushBatchMemory(profiles);
      return;
    }

    if (recentBatchKeysQueueRef.current.length === 0) {
      pushBatchMemory(profiles);
      return;
    }

    replaceLatestBatchMemory(profiles);
  }

  function profileMatchesExcludeKeys(
    profile: ShuffleProfile,
    excludeKeys: ReadonlySet<string>,
  ) {
    return profileMatchesShuffleExcludeKeys(profile, excludeKeys);
  }

  function buildWindowExcludeKeys(options?: {
    excludeRecentBatches?: boolean;
  }) {
    const keys = new Set<string>();
    for (const key of getShuffleExcludeKeys()) {
      keys.add(key);
    }
    if (options?.excludeRecentBatches) {
      for (const batch of recentBatchKeysQueueRef.current) {
        for (const key of batch) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  useLayoutEffect(() => {
    const wasFrozen = prevShuffleFrozenRef.current;
    prevShuffleFrozenRef.current = shuffleFeedFrozen;

    if (isShuffleRevealDeferred() && getVisibleShuffleProfiles().length === 0) {
      restorePinnedShuffleWindowSync();
    }

    if (!wasFrozen && shuffleFeedFrozen) {
      const regularCount = Math.max(0, windowCountRef.current - featuredRef.current.length);
      capturePinnedShuffleWindow(
        featuredRef.current,
        activePoolRef.current,
        windowIndicesRef.current,
        regularCount,
      );
      if (isShuffleRevealDeferred() && getVisibleShuffleProfiles().length === 0) {
        restorePinnedShuffleWindowSync();
      }
      return;
    }

    if (wasFrozen && !shuffleFeedFrozen) {
      restorePinnedShuffleWindowSync();
      const visible = getVisibleShuffleProfiles();
      const pinnedWindow =
        shouldSuppressShuffleWindowRefresh() &&
        windowCountRef.current > 0 &&
        activePoolRef.current.length > 0;

      if (visible.length > 0) {
        patchShuffleSlotPresence(activePoolRef.current);
      } else if (pinnedWindow) {
        const regularCount = Math.max(0, windowCountRef.current - featuredRef.current.length);
        setShuffleSlotsWithFeatured(
          featuredRef.current,
          activePoolRef.current,
          windowIndicesRef.current,
          regularCount,
          false,
        );
      } else if (
        visible.length === 0 &&
        windowCountRef.current > 0 &&
        activePoolRef.current.length > 0
      ) {
        const regularCount = Math.max(0, windowCountRef.current - featuredRef.current.length);
        setShuffleSlotsWithFeatured(
          featuredRef.current,
          activePoolRef.current,
          windowIndicesRef.current,
          regularCount,
          false,
        );
      }
      setLoading(false);
      setListReady(true);
      markShuffleHydrated(
        Math.max(getVisibleShuffleProfiles().length, windowCountRef.current, 1),
      );
    }
  }, [shuffleFeedFrozen]);

  useEffect(() => {
    const closeFilters = () => setFiltersOpen(false);
    window.addEventListener("sayittome:close-filters", closeFilters);
    return () => window.removeEventListener("sayittome:close-filters", closeFilters);
  }, []);

  useEffect(() => {
    storyOwnerUidsRef.current = new Set(getCachedStoryGroups().map((group) => group.ownerUid));
  });

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const applyWindowFromPool = useCallback(
    (pool: ShuffleProfile[], options?: {
      forceReplace?: boolean;
      excludeRecentBatches?: boolean;
      resetBatchMemory?: boolean;
      recordBatchMemory?: boolean;
    }) => {
      const forceReplace = options?.forceReplace === true;
      const excludeRecentBatches = options?.excludeRecentBatches === true;
      const visibleNow = getVisibleShuffleProfiles();

      if (
        !forceReplace &&
        !excludeRecentBatches &&
        (shouldSuppressShuffleWindowRefresh() || shuffleFeedFrozenRef.current)
      ) {
        if (visibleNow.length > 0) {
          patchShuffleSlotPresence(pool.length > 0 ? pool : activePoolRef.current);
          setListReady(true);
          markShuffleHydrated(visibleNow.length);
          return;
        }

        if (pool.length > 0 || activePoolRef.current.length > 0) {
          setLoading(false);
          setListReady(hasShuffleEverHydrated());
          return;
        }
      }

      const excludeKeys = buildWindowExcludeKeys({ excludeRecentBatches });
      const excludeSet = excludeKeys.size > 0 ? excludeKeys : undefined;

      let featured = dedupeShuffleProfiles(featuredRef.current);
      if (excludeRecentBatches && excludeSet) {
        featured = featured.filter(
          (profile) => !profileMatchesExcludeKeys(profile, excludeSet),
        );
      }
      featuredRef.current = featured;
      const featuredKeys = new Set<string>();
      for (const profile of featured) {
        for (const key of shuffleProfileDedupeKeys(profile)) {
          featuredKeys.add(key);
        }
      }
      const eligiblePool = dedupeShuffleProfiles(
        pool.filter((profile) => {
          const keys = shuffleProfileDedupeKeys(profile);
          return keys.length === 0 || !keys.some((key) => featuredKeys.has(key));
        }),
      );
      const len = eligiblePool.length;
      const featuredCount = featured.length;

      if (len === 0 && featuredCount === 0) {
        const hadVisible = getVisibleShuffleProfiles().length > 0;
        if (hadVisible && options?.resetBatchMemory !== true) {
          return;
        }

        windowCountRef.current = 0;
        setShuffleSlotsWithFeatured([], [], windowIndicesRef.current, 0, true);
        setListReady(false);
        clearBatchMemory();
        return;
      }

      const remainingSlots = Math.max(0, SHUFFLE_WINDOW_SIZE - featuredCount);
      const regularCount =
        len > 0
          ? pickRandomUniqueWindowIndices(
              eligiblePool,
              scratchIndicesRef.current,
              windowIndicesRef.current,
              remainingSlots,
              excludeSet,
              { strictExclude: excludeRecentBatches },
            )
          : 0;

      windowCountRef.current = featuredCount + regularCount;

      const shownProfiles = uniqueShuffleWindow([
        ...featured,
        ...Array.from({ length: regularCount }, (_, slot) => eligiblePool[windowIndicesRef.current[slot]]),
      ].filter(Boolean) as ShuffleProfile[]);

      if (options?.recordBatchMemory !== false) {
        rememberBatchMemory(shownProfiles, {
          shuffleRound: excludeRecentBatches,
          resetBatchMemory: options?.resetBatchMemory,
        });
      }

      setShuffleSlotsWithFeatured(
        featured,
        eligiblePool,
        windowIndicesRef.current,
        regularCount,
        forceReplace,
      );
      warmShuffleImages(shownProfiles, SHUFFLE_WINDOW_SIZE, { urgent: forceReplace });
      setListReady(true);
      markShuffleHydrated(shownProfiles.length);
    },
    [],
  );

  useEffect(() => {
    return subscribeShuffleExclude(() => {
      if (!mountedRef.current || shuffleFeedFrozenRef.current) return;
      const pool = activePoolRef.current;
      if (pool.length > 0 || featuredRef.current.length > 0) {
        applyWindowFromPool(refreshPoolPresence(pool));
      }
    });
  }, [applyWindowFromPool]);

  const applyPool = useCallback(
    (profiles: ShuffleProfile[], total: number) => {
      if (profiles.length === 0) return;

      poolRef.current = dedupeShuffleProfiles(profiles);

      if (total > 0) totalLiveRef.current = total;

      setTotalLive(total > 0 ? total : profiles.length);
      setLoading(false);
      setErrorText("");
      warmShuffleImages(profiles, 24, { urgent: true });
    },
    [],
  );

  const filterActivePool = useCallback(
    (
      needle: string,
      nextFilters = filtersRef.current,
      options?: { forceWindow?: boolean },
    ) => {
      const forceWindow = options?.forceWindow === true;
      const q = needle.trim();
      const storyOwnerUids = storyOwnerUidsRef.current;
      const now = Date.now();

      const filtered = refreshPoolPresence(
        poolRef.current.filter((profile) => {
          if (!profileMatchesShuffleSearch(profile, q)) return false;
          return profileMatchesShuffleFilters(profile, nextFilters, { storyOwnerUids, now });
        }),
        now,
      );

      featuredRef.current = dedupeShuffleProfiles(
        refreshPoolPresence(
          featuredRef.current.filter((profile) => {
            if (!profileMatchesShuffleSearch(profile, q)) return false;
            return profileMatchesShuffleFilters(profile, nextFilters, { storyOwnerUids, now });
          }),
          now,
        ),
      );

      activePoolRef.current = dedupeShuffleProfiles(filtered);
      setFilteredCount(activePoolRef.current.length);
      setFilteredOnlineCount(
        activePoolRef.current.filter((profile) =>
          isPublicShuffleOnline(profile, (p) => isShuffleProfileOnline(p, now)),
        ).length,
      );

      if (shuffleFeedFrozenRef.current && !forceWindow) {
        patchShuffleSlotPresence(activePoolRef.current);
        return;
      }

      if (
        shouldSuppressShuffleWindowRefresh() &&
        getVisibleShuffleProfiles().length > 0 &&
        !forceWindow
      ) {
        patchShuffleSlotPresence(activePoolRef.current);
        return;
      }

      if (shouldSuppressShuffleWindowRefresh() && !forceWindow) {
        setLoading(false);
        if (hasShuffleEverHydrated()) {
          setListReady(true);
        }
        return;
      }

      applyWindowFromPool(activePoolRef.current, {
        forceReplace: forceWindow,
        resetBatchMemory: forceWindow,
      });
    },
    [applyWindowFromPool],
  );

  const loadProfiles = useCallback(
    async ({
      q = "",
      force = false,
    }: {
      q?: string;
      force?: boolean;
    } = {}) => {
      // Search focus/typing must never start pool=full&force (or any pool GET).
      // Mount/TTL work is deferred until typing idle — no keypress-attributed fetch.
      if (deferShufflePoolLoadIfTyping({ q, force })) return;

      if (loadLockedRef.current && !force) return;

      loadLockedRef.current = true;

      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const timeout = window.setTimeout(() => controller.abort(), 12000);

      if (
        mountedRef.current &&
        poolRef.current.length === 0 &&
        getVisibleShuffleProfiles().length === 0 &&
        !hasShuffleEverHydrated() &&
        !shuffleFeedFrozenRef.current &&
        !shouldSuppressShuffleWindowRefresh()
      ) {
        setLoading(true);
        setErrorText("");
      }

      try {
        const params = new URLSearchParams({
          pool: "full",
          // Shuffle pool order on the server so cold restores never share a fixed prefix.
          shuffle: q ? "0" : "1",
        });
        if (q) params.set("q", q);
        if (force) params.set("force", "1");

        const res = await fetch(`/api/shuffle?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();

        if (!mountedRef.current || requestSeq !== requestSeqRef.current) return;

        const nextProfiles = normalizeShuffleProfiles(json?.profiles).map((profile) =>
          mergeShuffleProfileModeration(
            profile,
            poolRef.current.find((row) => row.uid === profile.uid) ||
              activePoolRef.current.find((row) => row.uid === profile.uid),
          ),
        );
        const nextFeatured = dedupeShuffleProfiles(
          normalizeShuffleProfiles(json?.featuredProfiles).map((profile) =>
            mergeShuffleProfileModeration(
              profile,
              featuredRef.current.find((row) => row.uid === profile.uid),
            ),
          ),
        );
        featuredRef.current = nextFeatured;
        const profilesCreated = Number(json?.profilesCreated ?? 0);
        const anonymousOnline = Number(json?.anonymousOnline ?? 0);
        const total =
          json?.totalLive != null
            ? Number(json.totalLive)
            : profilesCreated + anonymousOnline || nextProfiles.length;

        setProfilesCreated(profilesCreated);
        setAnonymousOnline(anonymousOnline);
        setLivePeopleCount(total > 0 ? total : profilesCreated + anonymousOnline);

        if (nextProfiles.length > 0) {
          applyPool(nextProfiles, total || profilesCreated || nextProfiles.length);
          writeCachedShufflePool(nextProfiles);
          writeCachedShuffleStats({
            profilesCreated,
            anonymousOnline,
            totalLive: total > 0 ? total : profilesCreated + anonymousOnline,
          });
          if (!shuffleFeedFrozenRef.current) {
            filterActivePool(q, filtersRef.current);
          } else if (getVisibleShuffleProfiles().length > 0) {
            patchShuffleSlotPresence(nextProfiles);
          }
        } else if (poolRef.current.length > 0) {
          if (!shuffleFeedFrozenRef.current) {
            filterActivePool(q, filtersRef.current);
          } else if (getVisibleShuffleProfiles().length > 0) {
            patchShuffleSlotPresence(poolRef.current);
          }
        } else {
          activePoolRef.current = [];
          setFilteredCount(0);
          setFilteredOnlineCount(0);
          applyWindowFromPool([]);
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
    releaseShuffleWindowRefreshSuppression();
    shuffleMark("shuffle-click-start");
    shuffleCount("shuffleClicks");

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const pool = activePoolRef.current;
    if (pool.length === 0 && featuredRef.current.length === 0) {
      shuffleMark("shuffle-click-end");
      return;
    }

    const before = windowSignature(getVisibleShuffleProfiles());
    const attempts: Array<{
      forceReplace: true;
      excludeRecentBatches?: boolean;
      resetBatchMemory?: boolean;
    }> = [
      { forceReplace: true, excludeRecentBatches: true },
      { forceReplace: true, excludeRecentBatches: false },
      { forceReplace: true, resetBatchMemory: true },
    ];

    for (let i = 0; i < attempts.length; i++) {
      const opts = attempts[i];
      const isLast = i === attempts.length - 1;

      applyWindowFromPool(refreshPoolPresence(pool), {
        ...opts,
        recordBatchMemory: false,
      });

      const visible = getVisibleShuffleProfiles();
      const after = windowSignature(visible);
      const changed = after !== before && visible.length > 0;

      if (changed || isLast) {
        rememberBatchMemory(visible, {
          shuffleRound: opts.excludeRecentBatches === true,
          resetBatchMemory: opts.resetBatchMemory === true,
        });
      }

      if (changed || isLast) break;
    }

    scrollShuffleFeedToTop();

    shuffleClickCountRef.current += 1;
    if (shuffleClickCountRef.current % 40 === 0) {
      shuffleDump("shuffle-spam");
    }

    shuffleMark("shuffle-click-end");
    shuffleMeasure("shuffle-click", "shuffle-click-start", "shuffle-click-end");
  }, [applyWindowFromPool]);

  const handleShuffleClickRef = useRef(handleShuffleClick);
  handleShuffleClickRef.current = handleShuffleClick;

  const loadProfilesRef = useRef(loadProfiles);
  loadProfilesRef.current = loadProfiles;

  const reloadDefaultShuffle = useCallback(async () => {
    await loadProfiles({ q: "", force: true });
    const pool = activePoolRef.current;
    if (pool.length > 0 || featuredRef.current.length > 0) {
      applyWindowFromPool(refreshPoolPresence(pool));
    }
  }, [applyWindowFromPool, loadProfiles]);

  const runSearch = useCallback(
    (value: string) => {
      const q = value.trim();

      if (!q) {
        void reloadDefaultShuffle();
        return;
      }

      filterActivePool(value, filtersRef.current);
      void loadProfiles({ q, force: true });
    },
    [filterActivePool, loadProfiles, reloadDefaultShuffle],
  );

  const handleSearchSubmit = useCallback(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    runSearch(searchRef.current);
  }, [runSearch]);

  const handleSearchFocus = useCallback(() => {
    // Arm before first keypress so late mount pool/countOnly cannot start in-window.
    markShuffleSearchTypingActive();
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      markShuffleSearchTypingActive();
      setSearch(value);

      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

      const q = value.trim();

      if (!q) {
        const cachedProfiles = readCachedShufflePool();
        const cachedStats = readCachedShuffleStats();

        if (cachedProfiles?.length) {
          applyPool(cachedProfiles, cachedStats?.totalLive || cachedProfiles.length);
          // forceWindow: typing must re-roll visible cards, not only patch presence
          // under warm-nav window-refresh suppression.
          filterActivePool("", filtersRef.current, { forceWindow: true });
          applyWindowFromPool(activePoolRef.current, { forceReplace: true });
        } else {
          // No pool yet: keep local empty/loading state. Never fetch from input.
          filterActivePool("", filtersRef.current, { forceWindow: true });
        }
        return;
      }

      // Live search: filter client pool + replace visible window immediately.
      // Warm-nav suppression must not freeze the feed while the user is typing.
      // Do NOT debounce loadProfiles(/api/shuffle?q=...) or reloadDefaultShuffle here —
      // Shuffle button / handleSearchSubmit owns network search; typing is client-pool only.
      releaseShuffleWindowRefreshSuppression();
      filterActivePool(value, filtersRef.current, { forceWindow: true });
    },
    [applyPool, applyWindowFromPool, filterActivePool],
  );

  const openFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const applyFilters = useCallback(
    (nextFilters: ShuffleFilters) => {
      filtersRef.current = nextFilters;
      setFiltersOpen(false);
      setFiltersState(nextFilters);
      saveStoredShuffleFilters(nextFilters);
      clearBatchMemory();

      const runFilter = () => {
        filterActivePool(searchRef.current.trim(), nextFilters, { forceWindow: true });
      };

      runFilter();

      if (nextFilters.soloConHistorias) {
        void refreshStoriesIndex(getStoryViewerKey(), false)
          .then(() => {
            storyOwnerUidsRef.current = new Set(
              getCachedStoryGroups().map((group) => group.ownerUid),
            );
            filterActivePool(searchRef.current.trim(), nextFilters, { forceWindow: true });
          })
          .catch(() => undefined);
      }
    },
    [filterActivePool],
  );

  const clearFilters = useCallback(() => {
    const cleared = defaultShuffleFilters();
    filtersRef.current = cleared;
    setFiltersOpen(false);
    setFiltersState(cleared);
    saveStoredShuffleFilters(cleared);
    clearBatchMemory();
    filterActivePool(searchRef.current.trim(), cleared, { forceWindow: true });
  }, [filterActivePool]);

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
        stashStoryReturnTo("/shuffle");
        stashProfileReturnTo("/shuffle");
        fastRouterPush(router, `/stories/${encodeURIComponent(ownerUid || username)}`);
      } else if (action === "profile") {
        stashProfileReturnTo("/shuffle");
        fastRouterPush(router, `/u/${encodeURIComponent(username)}`);
      } else if (action === "chat") {
        const senderId = getChatAnonSenderId();
        const chatId = buildProfileAnonChatId(senderId, username);
        prefetchChatThread(chatId);
        fastRouterPush(
          router,
          `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(username)}`,
        );
      }
    },
    [router],
  );

  useEffect(() => {
    registerShuffleClickHandler(() => {
      handleShuffleClickRef.current();
    });
    return () => registerShuffleClickHandler(null);
  }, []);

  useLayoutEffect(() => {
    if (initialShuffle.listReady || initialShuffle.visibleCount > 0) {
      markShuffleHydrated(initialShuffle.visibleCount);
    }

    if (
      poolRef.current.length > 0 &&
      getVisibleShuffleProfiles().length === 0 &&
      !shouldSuppressShuffleWindowRefresh() &&
      !shuffleFeedFrozenRef.current &&
      !hasShuffleEverHydrated()
    ) {
      filterActivePool("", filtersRef.current);
    }
  }, [filterActivePool]);

  useEffect(() => {
    mountedRef.current = true;
    attachShuffleProfilerWindow();
    releaseChatViewportLock();

    if (initialShuffle.listReady) {
      markShuffleHydrated(initialShuffle.visibleCount);
    }

    const loadingSafety = window.setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 15000);

    const cachedProfiles = readCachedShufflePool();
    const cachedStats = readCachedShuffleStats();

    if (cachedProfiles?.length) {
      applyPool(cachedProfiles, cachedStats?.totalLive || cachedProfiles.length);
      const visible = getVisibleShuffleProfiles();
      if (visible.length === 0) {
        // Cold entry: deal a fresh random 35 and reset batch memory.
        clearBatchMemory();
        filterActivePool("", filtersRef.current, { forceWindow: true });
      } else if (recentBatchKeysQueueRef.current.length === 0) {
        // Warm/pinned or cache-restore already painted — seed memory, don't reshuffle.
        rememberBatchMemory(visible, { resetBatchMemory: true });
      }
    }

    if (cachedStats) {
      setProfilesCreated(cachedStats.profilesCreated);
      setAnonymousOnline(cachedStats.anonymousOnline);
      setLivePeopleCount(cachedStats.totalLive);
      setTotalLive(cachedStats.totalLive);
      totalLiveRef.current = cachedStats.totalLive;
    }

    // Warm cache / pinned / already-hydrated: skip forced pool GET. Align with
    // ensureShufflePoolWarmForMicroSlide so remount/race cannot refetch warm-valid.
    // The 8m timer still refreshes TTL; Chats→Shuffle must not look like reload.
    if (!isShufflePoolWarmForNav()) {
      void loadProfiles({ q: "", force: true });
    }

    const scheduleStoriesIndex = () => {
      const run = () =>
        refreshStoriesIndex(getStoryViewerKey(), false)
          .then(() => {
            storyOwnerUidsRef.current = new Set(
              getCachedStoryGroups().map((group) => group.ownerUid),
            );
            if (!shuffleFeedFrozenRef.current && !shouldSuppressShuffleWindowRefresh()) {
              filterActivePool(search, filtersRef.current);
            }
          })
          .catch(() => {});
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 3000 });
      } else {
        window.setTimeout(run, 0);
      }
    };
    scheduleStoriesIndex();

    function onProfileModeration(event: Event) {
      const detail = (event as CustomEvent<{ uid?: string; moderationTag?: string }>).detail;
      const uid = String(detail?.uid || "");
      const moderationTag = String(detail?.moderationTag || "");
      if (!uid) return;

      const patchModeration = (profile: ShuffleProfile) =>
        profile.uid === uid ? { ...profile, moderationTag } : profile;

      poolRef.current = poolRef.current.map(patchModeration);
      activePoolRef.current = activePoolRef.current.map(patchModeration);
      featuredRef.current = featuredRef.current.map(patchModeration);
    }

    function onProfileBlur(event: Event) {
      const detail = (event as CustomEvent<{ uid?: string; mediaBlurFlags?: Record<string, boolean> }>)
        .detail;
      const uid = String(detail?.uid || "");
      const mediaBlurFlags = detail?.mediaBlurFlags || {};
      if (!uid) return;

      const patchBlur = (profile: ShuffleProfile) =>
        profile.uid === uid ? applyShuffleProfileBlurFlags(profile, mediaBlurFlags) : profile;

      poolRef.current = poolRef.current.map(patchBlur);
      activePoolRef.current = activePoolRef.current.map(patchBlur);
      featuredRef.current = featuredRef.current.map(patchBlur);
    }

    window.addEventListener("sayittome:shuffle-profile-moderation", onProfileModeration);
    window.addEventListener("sayittome:shuffle-profile-blur", onProfileBlur);

    function onPoolWarmed() {
      if (!mountedRef.current) return;
      const warmed = readCachedShufflePool();
      const warmedStats = readCachedShuffleStats();
      if (!warmed?.length) return;
      applyPool(warmed, warmedStats?.totalLive || warmed.length);
      if (!shuffleFeedFrozenRef.current) {
        filterActivePool(searchRef.current.trim(), filtersRef.current, { forceWindow: true });
      }
      setLoading(false);
      setListReady(true);
      setErrorText("");
    }
    window.addEventListener("sayittome:shuffle-pool-warmed", onPoolWarmed);

    const presenceTimer = window.setInterval(() => {
      if (poolRef.current.length === 0) return;

      const now = Date.now();
      poolRef.current = refreshPoolPresence(poolRef.current, now);
      const filters = filtersRef.current;
      const needsMembershipRefresh =
        filters.soloOnline || filters.soloConHistorias || filters.soloConFoto;

      if (needsMembershipRefresh) {
        filterActivePool(searchRef.current, filters);
        return;
      }

      activePoolRef.current = refreshPoolPresence(activePoolRef.current, now);
      featuredRef.current = refreshPoolPresence(featuredRef.current, now);
      setFilteredOnlineCount(
        activePoolRef.current.filter((profile) =>
          isPublicShuffleOnline(profile, (p) => isShuffleProfileOnline(p, now)),
        ).length,
      );
      patchShuffleSlotPresence(activePoolRef.current);
    }, 45_000);

    // TTL-aligned refresh: only force-fetch when session cache expired.
    // Do not reissue pool=full while warm-valid TTL remains (long Chats↔Shuffle runs).
    const poolSyncTimer = window.setInterval(() => {
      const stillWarm = readCachedShufflePool();
      if (stillWarm && stillWarm.length >= 3) {
        return;
      }
      void loadProfiles({ q: searchRef.current.trim(), force: true });
    }, 8 * 60_000);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(loadingSafety);
      window.clearInterval(presenceTimer);
      window.clearInterval(poolSyncTimer);
      window.removeEventListener("sayittome:shuffle-profile-moderation", onProfileModeration);
      window.removeEventListener("sayittome:shuffle-profile-blur", onProfileBlur);
      window.removeEventListener("sayittome:shuffle-pool-warmed", onPoolWarmed);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      abortRef.current?.abort();
    };
  }, [applyPool, filterActivePool, loadProfiles]);

  useEffect(() => {
    let cancelled = false;
    let countOnlyInflight = false;

    async function pollLivePeopleCount() {
      if (deferShuffleCountOnlyIfTyping()) return;
      if (countOnlyInflight) return;
      // Remount/HMR/strict re-entry must not re-hit countOnly within the gap —
      // prod critical saw duplicate countOnly land inside the typing window.
      const now = Date.now();
      const g = globalThis as typeof globalThis & {
        __sayittomeShuffleCountOnlyAt?: number;
      };
      const lastAt = Number(g.__sayittomeShuffleCountOnlyAt || 0);
      if (lastAt > 0 && now - lastAt < 45_000) {
        return;
      }
      countOnlyInflight = true;
      g.__sayittomeShuffleCountOnlyAt = now;
      try {
        const res = await fetch(`/api/shuffle?countOnly=1`, {
          cache: "default",
        });
        const json = await res.json();
        if (cancelled || !mountedRef.current) return;

        const created = Number(json?.profilesCreated ?? 0);
        const anon = Number(json?.anonymousOnline ?? 0);
        const total = Number(json?.totalLive ?? created + anon);

        setProfilesCreated(created);
        setAnonymousOnline(anon);
        setLivePeopleCount(total);
        if (total > 0) {
          setTotalLive(total);
          totalLiveRef.current = total;
        }
      } catch {
        // Keep the last known count when a poll fails.
      } finally {
        countOnlyInflight = false;
      }
    }

    registerShuffleSearchTypingFlushers({
      loadProfiles: (opts) => {
        void loadProfilesRef.current?.(opts);
      },
      pollCountOnly: () => {
        void pollLivePeopleCount();
      },
    });

    void pollLivePeopleCount();
    const liveCountTimer = window.setInterval(pollLivePeopleCount, 5 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(liveCountTimer);
      unregisterShuffleSearchTypingFlushers();
    };
  }, []);

  const filtersActiveCount = useMemo(
    () => shuffleFiltersActiveCount(filters),
    [filters],
  );

  const hasActiveDiscovery = useMemo(
    () => shuffleFiltersActiveCount(filters) > 0 || search.trim().length > 0,
    [filters, search],
  );

  const visibleCount = filteredCount;

  return {
    search,
    totalLive,
    profilesCreated,
    anonymousOnline,
    livePeopleCount,
    loading,
    errorText,
    listReady,
    filteredOnlineCount,
    poolSize: poolRef.current.length,
    visibleCount,
    hasActiveDiscovery,
    filters,
    filtersOpen,
    filtersActiveCount,
    handleSearchChange,
    handleSearchFocus,
    handleSearchSubmit,
    handleShuffleClick,
    handleListClick,
    openFilters,
    closeFilters,
    applyFilters,
    clearFilters,
  };
}
