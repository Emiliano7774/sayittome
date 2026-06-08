"use client";

import Link from "next/link";

import StoriesHub from "@/components/stories/StoriesHub";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { useStoriesGroups } from "@/hooks/useStoriesGroups";
import { useT } from "@/contexts/LocaleContext";

export default function ClassicStoriesPage() {
  const t = useT();
  const { groups, viewerUid, loading } = useStoriesGroups();

  return (
    <main className="min-h-screen bg-black px-5 py-8 pb-32 text-white">
      <ClassicUxModeBar className="mb-4" />

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
        <StoriesHub groups={groups} viewerUid={viewerUid} />
      )}
    </main>
  );
}
