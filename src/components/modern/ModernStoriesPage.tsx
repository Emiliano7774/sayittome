"use client";

import Link from "next/link";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import StoriesHub from "@/components/stories/StoriesHub";
import { useStoriesGroups } from "@/hooks/useStoriesGroups";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { useT } from "@/contexts/LocaleContext";

export default function ModernStoriesPage() {
  const t = useT();
  const { groups, viewerUid, ownerKey, loading, indexPending } = useStoriesGroups();

  useNavUsefulPaint(!loading && !indexPending, "/stories");

  return (
    <main className="min-h-screen bg-black pb-32 text-white" data-nav-primary-content>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <ModernPageHeader title={t("stories_title")} subtitle={t("stories_subtitle")} />

        {groups.length > 0 ? (
          <StoriesHub groups={groups} viewerUid={viewerUid} ownerKey={ownerKey} />
        ) : indexPending ? (
          // Stable awaiting shell (no "Cargando historias..." / data-nav-loading-copy).
          // Tab stay gates treat that copy as FAIL when Stories is already final.
          <div
            className="flex min-h-[45vh] flex-col items-center justify-center text-center"
            aria-busy="true"
            data-stories-index-pending="1"
          />
        ) : loading ? (
          <p
            className="text-center text-lg font-black text-white/35"
            data-nav-loading-copy="1"
          >
            {t("stories_loading")}
          </p>
        ) : (
          <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-black text-white/35">{t("stories_empty")}</p>
            <Link
              href="/stories/new"
              className="mt-6 rounded-full bg-violet-600 px-6 py-3 text-sm font-black"
            >
              {t("stories_create")}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
