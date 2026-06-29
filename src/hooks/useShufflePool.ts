"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  dedupeShuffleProfiles,
  shuffleProfileDedupeKeys,
  uniqueShuffleWindow,
} from "@/lib/shuffle/dedupeProfiles";
import { getShuffleExcludeKeys, subscribeShuffleExclude } from "@/lib/shuffle/shuffleExcludeStore";
import { normalizeShuffleProfiles } from "@/lib/shuffle/normalize";
import { isPublicShuffleOnline } from "@/lib/profile/lastSeenVisibility";
import { isShuffleProfileOnline } from "@/lib/presence";
import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
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
import { applyShuffleProfileBlurFlags } from "@/lib/shuffle/resolveShuffleBlur";
import {
  pickRandomUniqueWindowIndices,
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
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";
import { warmShuffleImages } from "@/lib/shuffle/warmImages";
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

export function useShufflePool() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [totalLive, setTotalLive] = useState(0);
  const [profilesCreated, setProfilesCreated] = useState(0);
  const [anonymousOnline, setAnonymousOnline] = useState(0);
  const [livePeopleCount, setLivePeopleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [listReady, setListReady] = useState(false);
  const [filters, setFiltersState] = useState<ShuffleFilters>(() => loadStoredShuffleFilters());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filteredCount, setFilteredCount] = useState(0);
  const [filteredOnlineCount, setFilteredOnlineCount] = useState(0);

  const filtersRef = useRef<ShuffleFilters>(loadStoredShuffleFilters());
  const searchRef = useRef("");
  const storyOwnerUidsRef = useRef<Set<string>>(new Set());
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
  const featuredRef = useRef<ShuffleProfile[]>([]);
  const shuffleClickCountRef = useRef(0);
  const recentlyShownKeysRef = useRef<string[]>([]);
  const mountedRef = useRef(false);

  const RECENTLY_SHOWN_CAP = 90;

  function rememberShownProfiles(profiles: ShuffleProfile[]) {
    const queue = recentlyShownKeysRef.current;

    for (const profile of profiles) {
      for (const key of shuffleProfileDedupeKeys(profile)) {
        if (!queue.includes(key)) queue.push(key);
      }
    }

    while (queue.length > RECENTLY_SHOWN_CAP) {
      queue.shift();
    }
  }

  function recentExcludeKeys() {
    const keys = new Set(recentlyShownKeysRef.current);
    for (const key of getShuffleExcludeKeys()) {
      keys.add(key);
    }
    return keys;
  }

  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

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
    (pool: ShuffleProfile[], options?: { forceReplace?: boolean }) => {
      const forceReplace = options?.forceReplace === true;
    const featured = dedupeShuffleProfiles(featuredRef.current);
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
      windowCountRef.current = 0;
      setShuffleSlotsWithFeatured([], [], windowIndicesRef.current, 0, true);
      setListReady(false);
      return;
    }

    const excludeKeys = forceReplace ? undefined : recentExcludeKeys();
    const remainingSlots = Math.max(0, SHUFFLE_WINDOW_SIZE - featuredCount);
    const regularCount =
      len > 0
        ? pickRandomUniqueWindowIndices(
            eligiblePool,
            scratchIndicesRef.current,
            windowIndicesRef.current,
            remainingSlots,
            excludeKeys,
          )
        : 0;

    windowCountRef.current = featuredCount + regularCount;

    const shownProfiles = uniqueShuffleWindow([
      ...featured,
      ...Array.from({ length: regularCount }, (_, slot) => eligiblePool[windowIndicesRef.current[slot]]),
    ].filter(Boolean) as ShuffleProfile[]);

    rememberShownProfiles(shownProfiles);

    setShuffleSlotsWithFeatured(
      featured,
      eligiblePool,
      windowIndicesRef.current,
      regularCount,
      forceReplace,
    );
    setListReady(true);
  }, []);

  useEffect(() => {
    return subscribeShuffleExclude(() => {
      if (!mountedRef.current) return;
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
      warmShuffleImages(profiles);
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
      applyWindowFromPool(activePoolRef.current, { forceReplace: forceWindow });
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
          pool: "full",
          shuffle: "0",
        });
        if (q) params.set("q", q);
        if (force) params.set("force", "1");

        const res = await fetch(`/api/shuffle?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();

        if (!mountedRef.current || requestSeq !== requestSeqRef.current) return;

        const nextProfiles = normalizeShuffleProfiles(json?.profiles);
        const nextFeatured = dedupeShuffleProfiles(
          normalizeShuffleProfiles(json?.featuredProfiles),
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
          filterActivePool(q, filtersRef.current);
        } else if (poolRef.current.length > 0) {
          filterActivePool(q, filtersRef.current);
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
    shuffleMark("shuffle-click-start");
    shuffleCount("shuffleClicks");

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const pool = activePoolRef.current;
    if (pool.length > 0 || featuredRef.current.length > 0) {
      recentlyShownKeysRef.current = [];
      applyWindowFromPool(refreshPoolPresence(pool), { forceReplace: true });
    }

    shuffleClickCountRef.current += 1;
    if (shuffleClickCountRef.current % 40 === 0) {
      shuffleDump("shuffle-spam");
    }

    shuffleMark("shuffle-click-end");
    shuffleMeasure("shuffle-click", "shuffle-click-start", "shuffle-click-end");
  }, [applyWindowFromPool]);

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

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);

      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

      const q = value.trim();

      if (!q) {
        const cachedProfiles = readCachedShufflePool();
        const cachedStats = readCachedShuffleStats();

        if (cachedProfiles?.length) {
          applyPool(cachedProfiles, cachedStats?.totalLive || cachedProfiles.length);
          filterActivePool("", filtersRef.current);
          applyWindowFromPool(activePoolRef.current);
        } else {
          filterActivePool("", filtersRef.current);
        }

        searchTimerRef.current = window.setTimeout(() => {
          void reloadDefaultShuffle();
        }, 200);
        return;
      }

      filterActivePool(value, filtersRef.current);

      searchTimerRef.current = window.setTimeout(() => {
        runSearch(value);
      }, 250);
    },
    [applyPool, applyWindowFromPool, filterActivePool, reloadDefaultShuffle, runSearch],
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
      recentlyShownKeysRef.current = [];

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
    recentlyShownKeysRef.current = [];
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
        router.push(`/stories/${encodeURIComponent(ownerUid || username)}`);
      } else if (action === "profile") {
        router.push(`/u/${encodeURIComponent(username)}`);
      } else if (action === "chat") {
        const senderId = getChatAnonSenderId();
        const chatId = buildProfileAnonChatId(senderId, username);
        router.push(
          `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(username)}`,
        );
      }
    },
    [router],
  );

  useEffect(() => {
    mountedRef.current = true;
    attachShuffleProfilerWindow();
    document.body.classList.remove("sayittome-chat-open");

    const loadingSafety = window.setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 15000);

    const cachedProfiles = readCachedShufflePool();
    const cachedStats = readCachedShuffleStats();

    if (cachedProfiles?.length) {
      applyPool(cachedProfiles, cachedStats?.totalLive || cachedProfiles.length);
      filterActivePool("", filtersRef.current);
    }

    if (cachedStats) {
      setProfilesCreated(cachedStats.profilesCreated);
      setAnonymousOnline(cachedStats.anonymousOnline);
      setLivePeopleCount(cachedStats.totalLive);
      setTotalLive(cachedStats.totalLive);
      totalLiveRef.current = cachedStats.totalLive;
    }

    void loadProfiles({ q: "", force: !cachedProfiles?.length });

    const scheduleStoriesIndex = () => {
      const run = () =>
        refreshStoriesIndex(getStoryViewerKey(), false)
          .then(() => {
            storyOwnerUidsRef.current = new Set(
              getCachedStoryGroups().map((group) => group.ownerUid),
            );
            filterActivePool(search, filtersRef.current);
          })
          .catch(() => {});
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

    const poolSyncTimer = window.setInterval(() => {
      void loadProfiles({ q: searchRef.current.trim(), force: true });
    }, 8 * 60_000);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(loadingSafety);
      window.clearInterval(presenceTimer);
      window.clearInterval(poolSyncTimer);
      window.removeEventListener("sayittome:shuffle", onShuffleEvent);
      window.removeEventListener("sayittome:shuffle-profile-moderation", onProfileModeration);
      window.removeEventListener("sayittome:shuffle-profile-blur", onProfileBlur);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      abortRef.current?.abort();
    };
  }, [filterActivePool, handleShuffleClick, loadProfiles]);

  useEffect(() => {
    let cancelled = false;

    async function pollLivePeopleCount() {
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
      }
    }

    void pollLivePeopleCount();
    const liveCountTimer = window.setInterval(pollLivePeopleCount, 5 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(liveCountTimer);
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
    handleSearchSubmit,
    handleShuffleClick,
    handleListClick,
    openFilters,
    closeFilters,
    applyFilters,
    clearFilters,
  };
}
