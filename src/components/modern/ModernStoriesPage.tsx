"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import StoriesHub from "@/components/stories/StoriesHub";
import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/anonStories";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import type { StoryUserGroup } from "@/lib/stories/types";
import { useT } from "@/contexts/LocaleContext";

export default function ModernStoriesPage() {
  const t = useT();
  const [groups, setGroups] = useState<StoryUserGroup[]>([]);
  const [viewerUid, setViewerUid] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      const uid = resolveStoryViewerId(user);
      setViewerUid(uid);

      try {
        const data = await fetchActiveStoriesGrouped(uid);
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
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <ModernPageHeader title={t("stories_title")} subtitle={t("stories_subtitle")} />

        {loading ? (
          <p className="text-center text-lg font-black text-white/35">{t("stories_loading")}</p>
        ) : groups.length === 0 ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-black text-white/35">{t("stories_empty")}</p>
            <Link
              href="/stories/new"
              className="mt-6 rounded-full bg-violet-600 px-6 py-3 text-sm font-black"
            >
              {t("stories_create")}
            </Link>
          </div>
        ) : (
          <StoriesHub groups={groups} viewerUid={viewerUid} variant="modern" />
        )}
      </div>
    </main>
  );
}
