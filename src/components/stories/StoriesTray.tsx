"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import StoryRing from "@/components/stories/StoryRing";
import AppImage from "@/components/media/AppImage";
import { useT } from "@/contexts/LocaleContext";
import { prefetchOwnerStories } from "@/lib/stories/storiesIndexStore";
import { storyDisplayName } from "@/lib/stories/storyDisplay";
import type { StoryUserGroup } from "@/lib/stories/types";

type Props = {
  groups: StoryUserGroup[];
  showAdd?: boolean;
};

export default function StoriesTray({ groups, showAdd = true }: Props) {
  const t = useT();

  return (
    <div className="flex gap-5 overflow-x-auto pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {showAdd ? (
        <Link
          href="/stories/new"
          className="flex shrink-0 flex-col items-center gap-2"
        >
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-white/15 bg-[#161616]">
            <Plus size={32} className="text-white/80" />
          </div>
          <span className="max-w-[72px] truncate text-sm font-bold text-white/55">
            {t("stories_your_story")}
          </span>
        </Link>
      ) : null}

      {groups.map((group) => (
        <Link
          key={group.ownerUid}
          href={`/stories/${encodeURIComponent(group.ownerUid)}`}
          className="flex shrink-0 flex-col items-center gap-2"
          onMouseEnter={() => prefetchOwnerStories(group.ownerUid, group.ownerUsername)}
          onFocus={() => prefetchOwnerStories(group.ownerUid, group.ownerUsername)}
        >
          <StoryRing active={group.hasUnseen}>
            <div className="relative h-[66px] w-[66px] overflow-hidden rounded-full bg-[#242424]">
              {group.ownerPhoto ? (
                <AppImage
                  src={group.ownerPhoto}
                  alt={group.ownerUsername}
                  fill
                  sizes="66px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-black text-white/50">
                  {storyDisplayName(group, t).slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </StoryRing>
          <span className="max-w-[72px] truncate text-sm font-bold text-white/70">
            {storyDisplayName(group, t)}
          </span>
        </Link>
      ))}
    </div>
  );
}
