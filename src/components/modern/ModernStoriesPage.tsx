"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import StoriesTray from "@/components/stories/StoriesTray";
import { auth } from "@/lib/firebase";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import type { StoryUserGroup } from "@/lib/stories/types";

export default function ModernStoriesPage() {
  const [groups, setGroups] = useState<StoryUserGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const data = await fetchActiveStoriesGrouped(user?.uid || "");
        if (!cancelled) setGroups(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        <ModernPageHeader
          title="Historias"
          subtitle="Burbujas premium, 24h reales, mismo visor fullscreen."
          actions={
            <Link
              href="/stories/new"
              className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black shadow-[0_0_28px_rgba(124,58,237,.35)]"
            >
              + Crear
            </Link>
          }
        />

        <section className="rounded-[28px] border border-violet-500/12 bg-[#080808] p-5 shadow-[inset_0_0_50px_rgba(104,76,255,0.05)]">
          {loading ? (
            <p className="text-center text-lg font-black text-white/35">Cargando historias...</p>
          ) : groups.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <p className="text-2xl font-black text-white/35">No hay historias activas.</p>
              <Link
                href="/stories/new"
                className="mt-6 rounded-full bg-white px-8 py-3.5 text-sm font-black text-black"
              >
                Publicar la primera
              </Link>
            </div>
          ) : (
            <StoriesTray groups={groups} />
          )}
        </section>
      </div>
    </main>
  );
}
