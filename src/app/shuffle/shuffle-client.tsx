"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, User } from "lucide-react";

import ShuffleSlots from "@/components/shuffle/ShuffleSlots";
import { isRecentlyActive } from "@/lib/presence";
import { refreshPoolPresence } from "@/lib/shuffle/refreshPresence";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
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

function normalizeProfiles(raw: unknown): ShuffleProfile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any, index: number) => {
      const presenceAt = item?.presenceAt ? String(item.presenceAt) : undefined;
      const lastActive = item?.lastActive ? String(item.lastActive) : undefined;
      const online = item?.online === true;
      const adminBlurProfilePhoto = item?.adminBlurProfilePhoto === true;
      const adminBlurFotosPerfil = item?.adminBlurFotosPerfil === true;

      return {
        uid: String(item?.uid || item?.id || item?.username || `profile-${index}`),
        username: String(item?.username || "usuario"),
        bio: String(item?.bio || "Sin descripcion."),
        photo: String(item?.photo || item?.fotoPrincipal || item?.photoURL || ""),
        lastActive,
        presenceAt,
        online,
        adminBlurProfilePhoto,
        adminBlurFotosPerfil,
        showOnline:
          typeof item?.showOnline === "boolean"
            ? item.showOnline
            : isRecentlyActive(presenceAt, online),
        blurPhoto: profilePhotoRequiresBlur({
          adminBlurProfilePhoto,
          adminBlurFotosPerfil,
        }),
      };
    })
    .filter((p) => p.username && p.username !== "undefined");
}

export default function ShuffleClient() {
  shuffleCount("parentRenders");

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
    shuffleMark("shuffle-apply-window-start");

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

    shuffleMark("shuffle-apply-window-end");
    shuffleMeasure(
      "shuffle-apply-window",
      "shuffle-apply-window-start",
      "shuffle-apply-window-end",
    );
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

  async function loadProfiles({
    q = "",
    force = false,
  }: {
    q?: string;
    force?: boolean;
  }) {
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

      const nextProfiles = normalizeProfiles(json?.profiles);
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
  }

  const handleListClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-action][data-username]",
      );
      if (!target) return;

      const action = target.getAttribute("data-action");
      const username = target.getAttribute("data-username");
      if (!username) return;

      shuffleMark("shuffle-router-start");
      if (action === "profile") {
        router.push(`/u/${encodeURIComponent(username)}`);
      } else if (action === "chat") {
        router.push(`/u/${encodeURIComponent(username)}/chat`);
      }
      shuffleMark("shuffle-router-end");
      shuffleMeasure("shuffle-router", "shuffle-router-start", "shuffle-router-end");
    },
    [router],
  );

  const handleShuffleClick = useCallback(
    (event?: React.MouseEvent | Event) => {
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
    },
    [],
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    filterActivePool(value);

    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

    const q = value.trim();
    if (!q) return;

    searchTimerRef.current = window.setTimeout(() => {
      loadProfiles({ q, force: true });
    }, 550);
  }

  useEffect(() => {
    mountedRef.current = true;
    attachShuffleProfilerWindow();
    document.body.classList.remove("sayittome-chat-open");

    loadProfiles({ q: "", force: true });

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
  }, [handleShuffleClick]);

  const hasPool = poolRef.current.length > 0 || activePoolRef.current.length > 0;

  return (
    <main data-scroll-root className="min-h-screen bg-black text-white pb-32">
      <section className="w-full px-6 md:px-10">
        <div className="pt-8 pb-7 border-b border-white/10">
          <div className="h-20 rounded-[18px] bg-[#222] flex items-center px-7 gap-5">
            <Search size={44} className="text-white/40 shrink-0" />

            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nombre o descripcion..."
              className="w-full bg-transparent outline-none text-3xl font-black text-white placeholder:text-white/25"
            />
          </div>

          <div className="mt-8 flex items-center gap-7">
            <button
              type="button"
              onClick={handleShuffleClick}
              className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center active:scale-95 transition"
              aria-label="Cambiar perfiles"
            >
              <SlidersHorizontal size={34} />
            </button>

            <h1 className="text-5xl font-black">Filtro</h1>
          </div>

          <div className="mt-7 flex items-center justify-between text-white/45 font-black text-2xl">
            <span>Cambiar resultado</span>

            <span className="flex items-center gap-3">
              <User size={24} />
              {totalLive} personas
            </span>
          </div>
        </div>

        {loading && !hasPool ? (
          <div className="h-[50vh] flex items-center justify-center">
            <p className="text-4xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : !listReady && !hasPool ? (
          <div className="h-[50vh] flex flex-col items-center justify-center px-8 text-center">
            <p className="text-4xl font-black text-white/35">No hay perfiles para mostrar.</p>
            {errorText ? (
              <p className="mt-4 max-w-3xl text-white/35 font-bold">{errorText}</p>
            ) : null}
          </div>
        ) : (
          <div onClick={handleListClick}>
            <ShuffleSlots />
          </div>
        )}
      </section>
    </main>
  );
}
