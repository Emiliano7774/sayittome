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

/** Preload the next story in the current group plus the first stories of upcoming groups. */
export function preloadStoryPlaybackChain(
  groups: StoryUserGroup[],
  currentOwnerUid: string,
  storyIndex: number,
  currentStories: StoryItem[],
) {
  const nextStory = currentStories[storyIndex + 1];
  if (nextStory) preloadStoryMedia(nextStory);

  const nextSecond = currentStories[storyIndex + 2];
  if (nextSecond) preloadStoryMedia(nextSecond);

  const groupIndex = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  if (groupIndex < 0) return;

  for (let offset = 1; offset <= 2; offset += 1) {
    const upcoming = groups[groupIndex + offset];
    if (upcoming) preloadStoryGroup(upcoming, 2);
  }
}
