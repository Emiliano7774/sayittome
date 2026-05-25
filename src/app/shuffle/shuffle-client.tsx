"use client";

import { useEffect, useMemo, useState } from "react";
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

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function ShuffleClient() {
  const router = useRouter();

  const [all, setAll] = useState<Profile[]>([]);
  const [visible, setVisible] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);

  function reshuffle(source?: Profile[]) {
    const base = source || all;
    setVisible(shuffle(base).slice(0, 35));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const controller = new AbortController();
        const t = window.setTimeout(() => controller.abort(), 12000);

        const res = await fetch("/api/shuffle?ts=" + Date.now(), {
          cache: "no-store",
          signal: controller.signal,
        });

        window.clearTimeout(t);

        const json = await res.json();
        const profiles = Array.isArray(json.profiles) ? json.profiles : [];

        setAll(profiles);
        setTotalLive(Number(json.totalLive || profiles.length || 0));
        setVisible(shuffle(profiles).slice(0, 35));
      } catch {
        setAll([]);
        setVisible([]);
        setTotalLive(0);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a[href="/shuffle"], a[href^="/shuffle"]');
      if (link && window.location.pathname === "/shuffle") {
        e.preventDefault();
        reshuffle();
      }
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;

    return visible.filter((p) =>
      (p.username || "").toLowerCase().includes(q) ||
      (p.bio || "").toLowerCase().includes(q)
    );
  }, [visible, search]);

  return (
    <main className="min-h-screen bg-black text-white pb-32">
      <section className="w-full px-6 md:px-10">
        <div className="pt-8 pb-7 border-b border-white/10">
          <div className="h-20 rounded-[18px] bg-[#222] flex items-center px-7 gap-5">
            <Search size={44} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent outline-none text-3xl font-black text-white"
            />
          </div>

          <div className="mt-8 flex items-center gap-7">
            <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center">
              <SlidersHorizontal size={34} />
            </div>
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

        {loading ? (
          <div className="h-[50vh] flex items-center justify-center">
            <p className="text-4xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : (
          <div>
            {filtered.map((p, index) => {
              const username = p.username || "usuario";
              const bio = p.bio || "Sin descripción.";
              const online = isOnline(p);

              return (
                <div key={`${p.uid || username}-${index}`} className="w-full border-b border-white/10">
                  <div className="w-full py-7 flex items-center gap-7">
                    <button
                      type="button"
                      onClick={() => router.push(`/u/${encodeURIComponent(username)}`)}
                      className="relative shrink-0"
                    >
                      <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[#242424] flex items-center justify-center">
                        {p.photo ? (
                          <img src={p.photo} alt={username} className="w-full h-full object-cover" />
                        ) : (
                          <UserRound size={64} className="text-white/75" />
                        )}
                      </div>

                      {online && (
                        <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-[3px] border-black" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/u/${encodeURIComponent(username)}/chat`)}
                      className="min-w-0 flex-1 text-left"
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
