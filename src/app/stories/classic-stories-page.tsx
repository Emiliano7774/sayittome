"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import StoriesTray from "@/components/stories/StoriesTray";
import { auth } from "@/lib/firebase";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import type { StoryUserGroup } from "@/lib/stories/types";

export default function ClassicStoriesPage() {
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
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-6xl font-black tracking-[-0.08em]">Historias</h1>
        <Link
          href="/stories/new"
          className="rounded-full border border-violet-500/40 bg-violet-500/15 px-5 py-3 text-sm font-black text-violet-300"
        >
          Crear
        </Link>
      </div>

      {loading ? (
        <p className="text-2xl font-black text-white/35">Cargando historias...</p>
      ) : groups.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <p className="text-3xl font-black text-white/35">No hay historias activas.</p>
          <Link
            href="/stories/new"
            className="mt-6 rounded-full bg-white px-8 py-4 text-sm font-black text-black"
          >
            Publicar la primera
          </Link>
        </div>
      ) : (
        <StoriesTray groups={groups} />
      )}
    </main>
  );
}
