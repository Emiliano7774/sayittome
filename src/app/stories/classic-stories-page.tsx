"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import StoriesHub from "@/components/stories/StoriesHub";
import { auth } from "@/lib/firebase";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import type { StoryUserGroup } from "@/lib/stories/types";
import { useT } from "@/contexts/LocaleContext";

export default function ClassicStoriesPage() {
  const t = useT();
  const [groups, setGroups] = useState<StoryUserGroup[]>([]);
  const [viewerUid, setViewerUid] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || "";
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
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-6xl font-black tracking-[-0.08em]">{t("stories_title")}</h1>
      </div>

      {loading ? (
        <p className="text-2xl font-black text-white/35">{t("stories_loading")}</p>
      ) : groups.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <p className="text-3xl font-black text-white/35">{t("stories_empty")}</p>
          <Link
            href="/stories/new"
            className="mt-6 rounded-full bg-white px-8 py-4 text-sm font-black text-black"
          >
            {t("stories_create")}
          </Link>
        </div>
      ) : (
        <StoriesHub groups={groups} viewerUid={viewerUid} variant="classic" />
      )}
    </main>
  );
}
