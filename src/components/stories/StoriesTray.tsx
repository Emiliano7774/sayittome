"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import StoryRing from "@/components/stories/StoryRing";
import { prefetchOwnerStories } from "@/lib/stories/storiesIndexStore";
import type { StoryUserGroup } from "@/lib/stories/types";

type Props = {
  groups: StoryUserGroup[];
  showAdd?: boolean;
};

export default function StoriesTray({ groups, showAdd = true }: Props) {
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
            Tu historia
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
            <div className="h-[66px] w-[66px] overflow-hidden rounded-full bg-[#242424]">
              {group.ownerPhoto ? (
                <img
                  src={group.ownerPhoto}
                  alt={group.ownerUsername}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-black text-white/50">
                  {group.ownerUsername.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </StoryRing>
          <span className="max-w-[72px] truncate text-sm font-bold text-white/70">
            {group.ownerUsername}
          </span>
        </Link>
      ))}
    </div>
  );
}
