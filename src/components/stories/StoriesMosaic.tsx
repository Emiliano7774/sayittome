"use client";

import Link from "next/link";
import { Film } from "lucide-react";

import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import AppImage from "@/components/media/AppImage";
import { useStoryReturnStash } from "@/hooks/useStoryReturnStash";
import { useT } from "@/contexts/LocaleContext";
import { storyRequiresBlur } from "@/lib/moderation/blur";
import { prefetchOwnerStories } from "@/lib/stories/storiesIndexStore";
import { latestStoryInGroup, storyDisplayName } from "@/lib/stories/storyDisplay";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";

type Props = {
  groups: StoryUserGroup[];
  title?: string;
};

function StoryTile({
  story,
  group,
  storyCount,
  t,
  onOpen,
}: {
  story: StoryItem;
  group: StoryUserGroup;
  storyCount: number;
  t: ReturnType<typeof useT>;
  onOpen: () => void;
}) {
  const href = `/stories/${encodeURIComponent(story.ownerUid)}`;
  const username = storyDisplayName(group, t);
  const needsBlur = storyRequiresBlur(story);

  return (
    <Link
      href={href}
      onClick={onOpen}
      onPointerDown={() => prefetchOwnerStories(story.ownerUid, group.ownerUsername)}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_0_30px_rgba(0,0,0,.35)] transition hover:border-violet-500/35 hover:scale-[1.02] active:scale-[0.98]"
    >
      {story.mediaType === "video" && story.mediaUrl ? (
        <SensitiveMediaShell
          url={story.mediaUrl}
          mediaType="video"
          staticRequiresBlur={needsBlur}
          enableRuntimeScan={false}
          story={story}
          className="h-full w-full"
        >
          <>
            <video
              src={story.mediaUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5">
              <Film size={14} className="text-white" />
            </span>
          </>
        </SensitiveMediaShell>
      ) : story.mediaUrl ? (
        <SensitiveMediaShell
          url={story.mediaUrl}
          staticRequiresBlur={needsBlur}
          enableRuntimeScan={false}
          story={story}
          className="h-full w-full"
        >
          <div className="relative h-full w-full">
            <AppImage src={story.mediaUrl} alt="" fill className="object-cover" />
          </div>
        </SensitiveMediaShell>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-950 to-black p-4 text-center text-sm font-bold text-white/80">
          {story.texto}
        </div>
      )}

      {storyCount > 1 ? (
        <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-black text-white">
          {storyCount}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 pt-10">
        <p className="truncate text-sm font-black text-white">{username}</p>
        {group.isAnonymousStory ? (
          <p className="truncate text-xs text-white/55">{t("stories_anonymous_caption")}</p>
        ) : null}
      </div>
    </Link>
  );
}

export default function StoriesMosaic({ groups, title }: Props) {
  const t = useT();
  const stashStoryReturn = useStoryReturnStash();

  const tiles = groups
    .map((group) => {
      const story = latestStoryInGroup(group);
      if (!story) return null;
      return {
        story,
        group,
        storyCount: group.stories.length,
      };
    })
    .filter(Boolean) as Array<{
    story: StoryItem;
    group: StoryUserGroup;
    storyCount: number;
  }>;

  tiles.sort((a, b) => b.story.createdAtMs - a.story.createdAtMs);

  if (tiles.length === 0) return null;

  return (
    <section className="mt-8">
      {title ? (
        <h2 className="mb-4 text-2xl font-black tracking-tight text-white/90 md:text-3xl">
          {title}
        </h2>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tiles.map(({ story, group, storyCount }) => (
          <StoryTile
            key={group.ownerUid}
            story={story}
            group={group}
            storyCount={storyCount}
            t={t}
            onOpen={stashStoryReturn}
          />
        ))}
      </div>
    </section>
  );
}
