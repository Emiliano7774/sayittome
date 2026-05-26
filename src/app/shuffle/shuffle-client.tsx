"use client";

import { Search, SlidersHorizontal, User } from "lucide-react";

import ShuffleSlots from "@/components/shuffle/ShuffleSlots";
import { useShufflePool } from "@/hooks/useShufflePool";

/** Classic UX — lista congelada visualmente. */
export default function ShuffleClient() {
  const pool = useShufflePool();

  return (
    <main data-scroll-root className="min-h-screen bg-black text-white pb-32">
      <section className="w-full px-6 md:px-10">
        <div className="pt-8 pb-7 border-b border-white/10">
          <div className="h-20 rounded-[18px] bg-[#222] flex items-center px-7 gap-5">
            <Search size={44} className="text-white/40 shrink-0" />

            <input
              value={pool.search}
              onChange={(e) => pool.handleSearchChange(e.target.value)}
              placeholder="Buscar por nombre o descripcion..."
              className="w-full bg-transparent outline-none text-3xl font-black text-white placeholder:text-white/25"
            />
          </div>

          <div className="mt-8 flex items-center gap-7">
            <button
              type="button"
              onClick={pool.handleShuffleClick}
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
              {pool.totalLive} personas
            </span>
          </div>
        </div>

        {pool.loading && pool.listReady === false ? (
          <div className="h-[50vh] flex items-center justify-center">
            <p className="text-4xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : !pool.listReady ? (
          <div className="h-[50vh] flex flex-col items-center justify-center px-8 text-center">
            <p className="text-4xl font-black text-white/35">No hay perfiles para mostrar.</p>
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
