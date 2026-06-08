"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";

import StoriesTray from "@/components/stories/StoriesTray";
import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/anonStories";
import {
  getCachedStoryGroups,
  refreshStoriesIndex,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import type { StoryUserGroup } from "@/lib/stories/types";

type Props = {
  /** Fila simple como en captura Shuffle (sin caja HISTORIAS). */
  compact?: boolean;
};

export default function ModernStoriesBar({ compact = false }: Props) {
  const [groups, setGroups] = useState<StoryUserGroup[]>(() => getCachedStoryGroups());

  useEffect(() => {
    let cancelled = false;

    const unsubIndex = subscribeStoriesIndex(() => {
      if (!cancelled) setGroups(getCachedStoryGroups());
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      void refreshStoriesIndex(resolveStoryViewerId(user)).catch(() => {});
    });

    return () => {
      cancelled = true;
      unsubIndex();
      unsubAuth();
    };
  }, []);

  if (compact) {
    return (
      <section className="mb-1">
        <StoriesTray groups={groups} showAdd={false} />
      </section>
    );
  }

  const withStories = groups.length;

  return (
    <section className="rounded-[24px] border border-violet-500/10 bg-[#080808]/90 p-4 shadow-[inset_0_0_40px_rgba(104,76,255,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black tracking-[0.18em] text-violet-200/80">HISTORIAS</p>
        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-200">
          {withStories} activas
        </span>
      </div>

      <StoriesTray groups={groups} />

      <div className="mt-3 flex justify-end">
        <Link
          href="/stories/new"
          className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-[0_0_24px_rgba(124,58,237,.35)]"
        >
          + Historia
        </Link>
      </div>
    </section>
  );
}
