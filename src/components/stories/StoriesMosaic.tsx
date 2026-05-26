"use client";

import Link from "next/link";
import { Film } from "lucide-react";

import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";

type Props = {
  groups: StoryUserGroup[];
  title?: string;
};

function StoryTile({ story, username }: { story: StoryItem; username: string }) {
  const href = `/stories/${encodeURIComponent(story.ownerUid)}`;

  return (
    <Link
      href={href}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_0_30px_rgba(0,0,0,.35)] transition hover:border-violet-500/35 hover:scale-[1.02] active:scale-[0.98]"
    >
      {story.mediaType === "video" && story.mediaUrl ? (
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
      ) : story.mediaUrl ? (
        <img
          src={story.mediaUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-950 to-black p-4 text-center text-sm font-bold text-white/80">
          {story.texto}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 pt-10">
        <p className="truncate text-sm font-black text-white">@{username}</p>
      </div>
    </Link>
  );
}

export default function StoriesMosaic({ groups, title }: Props) {
  const tiles = groups.flatMap((group) =>
    group.stories.map((story) => ({
      story,
      username: group.ownerUsername,
    })),
  );

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
        {tiles.map(({ story, username }) => (
          <StoryTile key={story.id} story={story} username={username} />
        ))}
      </div>
    </section>
  );
}
