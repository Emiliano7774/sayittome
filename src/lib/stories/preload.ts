import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  storyPipelineMarkImageDecodeReady,
  storyPipelineMarkPreloadStart,
  storyPipelineMarkResponseReady,
  storyPipelineMarkVideoPhase,
  storyPipelineNoteMediaUrl,
} from "@/lib/perf/storyPipelineTrace";

const preloaded = new Set<string>();

export function clearStoryPreloadCache() {
  preloaded.clear();
}

function traceImageReady(img: HTMLImageElement, story: StoryItem) {
  if (!isNavTraceEnabled() || !story.mediaUrl) return;

  const markReady = () => {
    storyPipelineMarkResponseReady(story.mediaUrl!, "image", story.id);
    storyPipelineMarkImageDecodeReady(
      story.mediaUrl!,
      story.id,
      img.complete,
      img.naturalWidth,
      img.naturalHeight,
    );
  };

  if (img.complete && img.naturalWidth > 0) {
    markReady();
    return;
  }

  img.addEventListener(
    "load",
    () => {
      markReady();
      if (typeof img.decode === "function") {
        void img.decode().then(() => {
          storyPipelineMarkImageDecodeReady(
            story.mediaUrl!,
            story.id,
            img.complete,
            img.naturalWidth,
            img.naturalHeight,
          );
        }).catch(() => undefined);
      }
    },
    { once: true },
  );
}

function traceVideoReady(video: HTMLVideoElement, story: StoryItem) {
  if (!isNavTraceEnabled() || !story.mediaUrl) return;

  video.addEventListener(
    "loadedmetadata",
    () => storyPipelineMarkVideoPhase(story.mediaUrl!, "loadedmetadata", story.id),
    { once: true },
  );
  video.addEventListener(
    "canplay",
    () => {
      storyPipelineMarkVideoPhase(story.mediaUrl!, "canplay", story.id);
      storyPipelineMarkResponseReady(story.mediaUrl!, "video", story.id);
    },
    { once: true },
  );

  const markFirstFrame = () => {
    storyPipelineMarkVideoPhase(story.mediaUrl!, "first-frame", story.id);
  };

  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(() => markFirstFrame());
  } else {
    video.addEventListener("playing", () => markFirstFrame(), { once: true });
  }
}

export function preloadStoryMedia(story: StoryItem) {
  if (!story.mediaUrl) return;

  const mediaType = story.mediaType === "video" ? "video" : "image";
  storyPipelineNoteMediaUrl(story.mediaUrl, mediaType, story.id);

  if (preloaded.has(story.mediaUrl)) return;

  preloaded.add(story.mediaUrl);
  storyPipelineMarkPreloadStart(story.mediaUrl, mediaType, story.id);

  if (story.mediaType === "video") {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = story.mediaUrl;
    traceVideoReady(video, story);
    video.load();
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = story.mediaUrl;
  traceImageReady(img, story);
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
