"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, UserRound, User } from "lucide-react";

type Profile = {
  uid: string;
  username: string;
  bio: string;
  photo: string;
  lastActive?: string;
};

function isOnline(p: Profile) {
  if (!p.lastActive) return false;
  const d = new Date(p.lastActive);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= 15 * 60 * 1000;
}

function normalizeProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any, index: number) => ({
      uid: String(item?.uid || item?.id || item?.username || `profile-${index}`),
      username: String(item?.username || "usuario"),
      bio: String(item?.bio || "Sin descripcion."),
      photo: String(item?.photo || item?.fotoPrincipal || item?.photoURL || ""),
      lastActive: item?.lastActive ? String(item.lastActive) : undefined,
    }))
    .filter((p) => p.username && p.username !== "undefined");
}

function shuffleCopy<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function hardScrollTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "main, section, [data-scroll-root], #__next, body, html"
    )
  );

  for (const el of candidates) {
    try {
      el.scrollTop = 0;
    } catch {}
  }
}

function cachePayload(profiles: Profile[], totalLive: number) {
  try {
    sessionStorage.setItem(
      "sayittome_shuffle_cache",
      JSON.stringify({ profiles, totalLive, savedAt: Date.now() })
    );
  } catch {}
}

export default function ShuffleClient() {
  const router = useRouter();

  const [visibleProfiles, setVisibleProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [errorText, setErrorText] = useState("");

  const mountedRef = useRef(false);
  const poolRef = useRef<Profile[]>([]);
  const visibleRef = useRef<Profile[]>([]);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const shuffleFrameLockedRef = useRef(false);
  const remoteRefreshLockedRef = useRef(false);
  const lastRemoteRefreshAtRef = useRef(0);
  const lastCountRefreshAtRef = useRef(0);

  const filteredLocalPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return poolRef.current;
    return poolRef.current.filter((p) => {
      return (
        String(p.username || "").toLowerCase().includes(q) ||
        String(p.bio || "").toLowerCase().includes(q)
      );
    });
  }, [search, visibleProfiles]);

  function paintProfiles(next: Profile[], total = totalLive) {
    const limited = next.slice(0, 35);
    visibleRef.current = limited;
    setVisibleProfiles(limited);
    if (Number.isFinite(total)) setTotalLive(total);
    cachePayload(poolRef.current.length ? poolRef.current : limited, total);
  }

  async function refreshLiveCount() {
    const now = Date.now();
    if (now - lastCountRefreshAtRef.current < 25000) return;
    lastCountRefreshAtRef.current = now;

    try {
      const res = await fetch(`/api/shuffle?countOnly=1&ts=${Date.now()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      const realTotal = Number(json?.totalLive ?? json?.total ?? json?.count ?? 0);
      if (mountedRef.current && Number.isFinite(realTotal)) setTotalLive(realTotal);
    } catch {}
  }

  async function loadProfiles({
    q = "",
    force = false,
    shuffle = false,
  }: {
    q?: string;
    force?: boolean;
    shuffle?: boolean;
  }) {
    const now = Date.now();
    if (!force && !q && now - lastRemoteRefreshAtRef.current < 30000) {
      refreshLiveCount();
      return;
    }
    if (remoteRefreshLockedRef.current) return;

    remoteRefreshLockedRef.current = true;
    lastRemoteRefreshAtRef.current = now;

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = window.setTimeout(() => controller.abort(), 8000);

    if (mountedRef.current) {
      setErrorText("");
      setLoading(poolRef.current.length === 0);
    }

    try {
      const params = new URLSearchParams({
        limit: "300",
        shuffle: shuffle && !q ? "1" : "0",
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
      const realTotal = Number(
        json?.totalLive ?? json?.total ?? json?.count ?? json?.totalProfiles ?? nextProfiles.length
      );

      if (nextProfiles.length > 0) {
        poolRef.current = shuffle ? shuffleCopy(nextProfiles) : nextProfiles;
        paintProfiles(poolRef.current, realTotal);
      } else if (poolRef.current.length > 0) {
        paintProfiles(poolRef.current, realTotal || totalLive);
      } else {
        setVisibleProfiles([]);
      }

      if (json?.ok === false && json?.error) setErrorText(String(json.error));
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        console.error(error);
        if (mountedRef.current) setErrorText((error as Error)?.message || "Error cargando perfiles");
      }
    } finally {
      window.clearTimeout(timeout);
      remoteRefreshLockedRef.current = false;
      if (mountedRef.current && requestSeq === requestSeqRef.current) setLoading(false);
    }
  }

  function doLocalShuffle() {
    const source = search.trim() ? filteredLocalPool : poolRef.current;
    if (source.length === 0) return;

    const currentFirst = visibleRef.current[0]?.uid || visibleRef.current[0]?.username || "";
    let shuffled = shuffleCopy(source);

    if (shuffled.length > 1) {
      let guard = 0;
      while ((shuffled[0]?.uid || shuffled[0]?.username) === currentFirst && guard < 5) {
        shuffled = shuffleCopy(source);
        guard += 1;
      }
    }

    if (!search.trim()) poolRef.current = shuffled;
    paintProfiles(shuffled, totalLive);
  }

  function handleShuffleClick(event?: React.MouseEvent | Event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (shuffleFrameLockedRef.current) return;
    shuffleFrameLockedRef.current = true;

    requestAnimationFrame(() => {
      shuffleFrameLockedRef.current = false;
    });

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    setSearch("");
    hardScrollTop();
    setChanging(true);
    doLocalShuffle();

    window.setTimeout(() => {
      if (mountedRef.current) setChanging(false);
    }, 120);

    const now = Date.now();
    if (now - lastRemoteRefreshAtRef.current > 45000) {
      loadProfiles({ q: "", shuffle: true, force: false });
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);

    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

    const q = value.trim().toLowerCase();
    if (!q) {
      paintProfiles(poolRef.current, totalLive);
      return;
    }

    const local = poolRef.current.filter((p) => {
      return (
        String(p.username || "").toLowerCase().includes(q) ||
        String(p.bio || "").toLowerCase().includes(q)
      );
    });

    if (local.length > 0) paintProfiles(local, totalLive);

    searchTimerRef.current = window.setTimeout(() => {
      loadProfiles({ q, shuffle: false, force: true });
    }, 550);
  }

  useEffect(() => {
    mountedRef.current = true;
    document.body.classList.remove("sayittome-chat-open");

    try {
      const cached = sessionStorage.getItem("sayittome_shuffle_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedProfiles = normalizeProfiles(parsed?.profiles);
        if (cachedProfiles.length > 0) {
          poolRef.current = cachedProfiles;
          paintProfiles(cachedProfiles, Number(parsed?.totalLive || cachedProfiles.length));
          setLoading(false);
        }
      }
    } catch {}

    loadProfiles({ q: "", shuffle: true, force: true });

    const liveCounterTimer = window.setInterval(() => refreshLiveCount(), 25000);

    function onShuffleEvent(event: Event) {
      handleShuffleClick(event);
    }

    window.addEventListener("sayittome:shuffle", onShuffleEvent);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("sayittome:shuffle", onShuffleEvent);
      window.clearInterval(liveCounterTimer);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profiles = visibleProfiles;

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
            <span>{changing ? "Cambiando resultado..." : "Cambiar resultado"}</span>

            <span className="flex items-center gap-3">
              <User size={24} />
              {totalLive} personas
            </span>
          </div>
        </div>

        {loading && profiles.length === 0 ? (
          <div className="h-[50vh] flex items-center justify-center">
            <p className="text-4xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="h-[50vh] flex flex-col items-center justify-center px-8 text-center">
            <p className="text-4xl font-black text-white/35">No hay perfiles para mostrar.</p>
            {errorText ? <p className="mt-4 max-w-3xl text-white/35 font-bold">{errorText}</p> : null}
          </div>
        ) : (
          <div>
            {profiles.map((p) => {
              const username = p.username || "usuario";
              const bio = p.bio || "Sin descripcion.";
              const online = isOnline(p);

              return (
                <div key={p.uid || username} className="w-full border-b border-white/10">
                  <div className="w-full py-7 flex items-center gap-7">
                    <button
                      type="button"
                      onClick={() => router.push(`/u/${encodeURIComponent(username)}`)}
                      className="relative shrink-0 active:scale-95 transition"
                      aria-label={`Abrir perfil de ${username}`}
                    >
                      <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[#242424] flex items-center justify-center">
                        {p.photo ? (
                          <img
                            src={p.photo}
                            alt={username}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserRound size={64} className="text-white/75" />
                        )}
                      </div>

                      {online ? (
                        <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-[3px] border-black" />
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/u/${encodeURIComponent(username)}/chat`)}
                      className="min-w-0 flex-1 text-left active:scale-[0.99] transition"
                      aria-label={`Abrir chat con ${username}`}
                    >
                      <h2 className="text-3xl md:text-4xl font-black truncate">{username}</h2>
                      <p className="mt-2 text-xl md:text-2xl text-white/50 font-bold line-clamp-2">{bio}</p>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
