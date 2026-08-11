"use client";

import Link from "next/link";
import { useMemo } from "react";

import StoriesMosaic from "@/components/stories/StoriesMosaic";
import StoriesTray from "@/components/stories/StoriesTray";
import { useT } from "@/contexts/LocaleContext";
import { getStoryOwnerKey } from "@/lib/stories/storyAuthor";
import { splitMineStoryGroups } from "@/lib/stories/storyOwnerIdentity";
import type { StoryUserGroup } from "@/lib/stories/types";

type Props = {
  groups: StoryUserGroup[];
  viewerUid?: string;
  ownerKey?: string;
  variant?: "classic" | "modern";
};

export default function StoriesHub({
  groups,
  ownerKey = "",
  variant = "modern",
}: Props) {
  const t = useT();
  const mineKey = ownerKey || getStoryOwnerKey();

  const { mine, everyone } = useMemo(
    () => splitMineStoryGroups(groups, mineKey),
    [groups, mineKey],
  );

  const trayGroups = mineKey && mine.length ? mine : groups;
  const mosaicGroups = mineKey && mine.length ? [...mine, ...everyone] : groups;

  const isModern = variant === "modern";

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            className={
              isModern
                ? "text-xl font-black text-white/90"
                : "text-3xl font-black tracking-[-0.06em]"
            }
          >
            {mineKey && mine.length ? t("stories_yours") : t("stories_title")}
          </h2>
          <Link
            href="/stories/new"
            className={
              isModern
                ? "rounded-full bg-violet-600 px-4 py-2 text-xs font-black shadow-[0_0_24px_rgba(124,58,237,.35)]"
                : "rounded-full border border-violet-500/40 bg-violet-500/15 px-4 py-2 text-sm font-black text-violet-300"
            }
          >
            {t("stories_create_short")}
          </Link>
        </div>

        <StoriesTray groups={trayGroups} />
      </section>

      <StoriesMosaic groups={mosaicGroups} title={t("stories_mosaic_title")} />
      <div aria-hidden className="sayittome-nav-scroll-spacer" />
    </div>
  );
}
