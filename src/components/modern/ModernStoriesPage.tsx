"use client";

import Link from "next/link";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import StoriesHub from "@/components/stories/StoriesHub";
import { useStoriesGroups } from "@/hooks/useStoriesGroups";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { useT } from "@/contexts/LocaleContext";

export default function ModernStoriesPage() {
  const t = useT();
  const { groups, viewerUid, loading } = useStoriesGroups();

  useNavUsefulPaint(!loading, "/stories");

  return (
    <main className="min-h-screen bg-black pb-32 text-white" data-nav-primary-content>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <ModernPageHeader title={t("stories_title")} subtitle={t("stories_subtitle")} />

        {loading ? (
          <p
            className="text-center text-lg font-black text-white/35"
            data-nav-loading-copy="1"
          >
            {t("stories_loading")}
          </p>
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
          <StoriesHub groups={groups} viewerUid={viewerUid} />
        )}
      </div>
    </main>
  );
}
