import { getStoryViewerKey } from "@/lib/stories/storyAuthor";
import type { NextPlayTarget } from "@/lib/stories/storiesQueryGuard";
import { isStoryUnseenForViewer } from "@/lib/stories/storyViewedCache";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  recordPrefetchBytes,
  resolveAdaptivePreloadLimits,
} from "@/lib/stories/adaptivePreloadPolicy";
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

export function preloadStoryMedia(story: StoryItem, options?: { videoPreload?: "auto" | "metadata" }) {
  if (!story.mediaUrl) return;

  const mediaType = story.mediaType === "video" ? "video" : "image";
  storyPipelineNoteMediaUrl(story.mediaUrl, mediaType, story.id);

  if (preloaded.has(story.mediaUrl)) return;

  preloaded.add(story.mediaUrl);
  storyPipelineMarkPreloadStart(story.mediaUrl, mediaType, story.id);

  if (story.mediaType === "video") {
    const video = document.createElement("video");
    video.preload = options?.videoPreload ?? "auto";
    video.muted = true;
    video.src = story.mediaUrl;
    traceVideoReady(video, story);
    video.addEventListener(
      "loadeddata",
      () => recordPrefetchBytes(Math.max(1, video.videoWidth * video.videoHeight * 3)),
      { once: true },
    );
    video.load();
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = story.mediaUrl;
  traceImageReady(img, story);
  img.addEventListener(
    "load",
    () => recordPrefetchBytes(Math.max(1, img.naturalWidth * img.naturalHeight * 4)),
    { once: true },
  );
}

export function firstUnseenOrLatestStory(group: StoryUserGroup, viewerId = "") {
  const viewer = viewerId || getStoryViewerKey();
  const unseen = group.stories.find((story) => isStoryUnseenForViewer(story, viewer));
  return unseen || group.stories[group.stories.length - 1] || group.stories[0];
}

export function preloadStoryGroup(
  group?: StoryUserGroup | null,
  max = 2,
  options?: { videoPreload?: "auto" | "metadata" },
) {
  if (!group) return;

  const first = firstUnseenOrLatestStory(group);
  const rest = group.stories.filter((story) => story.id !== first?.id);
  [first, ...rest]
    .filter(Boolean)
    .slice(0, max)
    .forEach((story) => preloadStoryMedia(story, options));
}

export function preloadNextPlayTarget(
  nextTarget: NextPlayTarget<StoryUserGroup>,
  currentStories: StoryItem[],
  options?: { videoPreload?: "auto" | "metadata" },
) {
  if (nextTarget.kind === "same-group") {
    const story = currentStories[nextTarget.storyIndex];
    if (story) preloadStoryMedia(story, options);
    return;
  }
  if (nextTarget.kind === "next-group" && nextTarget.group) {
    const story = nextTarget.group.stories[nextTarget.storyIndex];
    if (story) preloadStoryMedia(story, options);
    else preloadStoryGroup(nextTarget.group, 1, options);
  }
}

/** Preload the next story in the current group plus the first stories of upcoming groups. */
export function preloadStoryPlaybackChain(
  groups: StoryUserGroup[],
  currentOwnerUid: string,
  storyIndex: number,
  currentStories: StoryItem[],
) {
  const limits = resolveAdaptivePreloadLimits();
  const videoPreload = limits.videoSpeculative ? "auto" : "metadata";

  const nextStory = currentStories[storyIndex + 1];
  if (nextStory) preloadStoryMedia(nextStory, { videoPreload });

  const nextSecond = currentStories[storyIndex + 2];
  if (limits.fetchAhead >= 2 && nextSecond) {
    preloadStoryMedia(nextSecond, { videoPreload });
  }

  const groupIndex = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  if (groupIndex < 0) return;

  const maxStoriesPerUser = limits.fetchAhead >= 2 ? 2 : 1;
  for (let offset = 1; offset <= limits.upcomingUserFirstMedia; offset += 1) {
    const upcoming = groups[groupIndex + offset];
    if (upcoming) preloadStoryGroup(upcoming, maxStoriesPerUser, { videoPreload });
  }
}
