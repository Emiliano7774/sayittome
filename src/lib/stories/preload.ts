import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";

const preloaded = new Set<string>();

export function preloadStoryMedia(story: StoryItem) {
  if (!story.mediaUrl || preloaded.has(story.mediaUrl)) return;

  preloaded.add(story.mediaUrl);

  if (story.mediaType === "video") {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = story.mediaUrl;
    video.load();
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = story.mediaUrl;
}

export function preloadStoryGroup(group?: StoryUserGroup | null, max = 2) {
  if (!group) return;

  group.stories.slice(0, max).forEach(preloadStoryMedia);
}
