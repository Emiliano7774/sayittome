"use client";

import { Camera, ImageIcon } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";
import { storyMediaSourceLabel } from "@/lib/stories/storyMediaSource";
import type { StoryMediaSource, StoryMediaType } from "@/lib/stories/types";

type Props = {
  source?: StoryMediaSource;
  mediaType: StoryMediaType;
  className?: string;
};

export default function StoryMediaSourceBadge({ source, mediaType, className = "" }: Props) {
  const t = useT();
  const label = storyMediaSourceLabel(source, mediaType, t);

  if (!label || !source) return null;

  const Icon = source === "camera" ? Camera : ImageIcon;

  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      <Icon size={13} strokeWidth={2.1} className="text-white/40" />
      <span>{label}</span>
    </div>
  );
}
