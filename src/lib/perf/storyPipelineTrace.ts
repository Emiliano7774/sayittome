/**
 * Dev-only Stories viewer / media pipeline tracing.
 */

import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

export type StoryMediaType = "image" | "video" | "text" | "unknown";

export type StoryPipelinePhase =
  | "media-url-known"
  | "preload-start"
  | "preload-request-start"
  | "media-response-ready"
  | "image-decode-ready"
  | "video-url-known"
  | "video-preload-requested"
  | "video-loadedmetadata"
  | "video-canplay"
  | "video-first-frame"
  | "media-ready-before-input"
  | "viewer-state-ready"
  | "viewer-dom"
  | "useful-paint";

type StoryPipelineMeta = {
  storyId?: string;
  ownerUid?: string;
  ownerUsername?: string;
  mediaUrl?: string;
  mediaType?: StoryMediaType;
  imgComplete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
};

type MediaTrack = {
  url: string;
  mediaType: StoryMediaType;
  storyId?: string;
  preloadStarted: boolean;
  responseReady: boolean;
  decodeReady: boolean;
  ready: boolean;
  imgComplete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
  videoLoadedMetadata?: boolean;
  videoCanPlay?: boolean;
  videoFirstFrame?: boolean;
};

let active = false;
let origin = 0;
let inputLocked = false;
const phases: Partial<Record<StoryPipelinePhase, number>> = {};
let meta: StoryPipelineMeta = {};
const mediaByUrl = new Map<string, MediaTrack>();

function now() {
  return performance.now();
}

function sync(key: string) {
  navTraceMarkDetail(`story-${key}`);
}

function track(url: string, patch: Partial<MediaTrack>) {
  const existing = mediaByUrl.get(url) || {
    url,
    mediaType: "unknown" as StoryMediaType,
    preloadStarted: false,
    responseReady: false,
    decodeReady: false,
    ready: false,
  };
  const next = { ...existing, ...patch };
  if (next.decodeReady || (next.mediaType === "image" && next.imgComplete && (next.naturalWidth || 0) > 0)) {
    next.ready = true;
  }
  if (
    next.mediaType === "video" &&
    next.videoFirstFrame &&
    next.videoCanPlay &&
    next.videoLoadedMetadata
  ) {
    next.ready = true;
  }
  mediaByUrl.set(url, next);
  return next;
}

export function storyPipelineBegin(patch?: Partial<StoryPipelineMeta>) {
  if (!isNavTraceEnabled() || typeof window === "undefined") return;
  active = true;
  origin = now();
  inputLocked = false;
  for (const k of Object.keys(phases)) delete phases[k as StoryPipelinePhase];
  meta = patch ? { ...patch } : {};
}

export function storyPipelineLockInput() {
  inputLocked = true;
}

export function storyPipelineMark(
  phase: StoryPipelinePhase,
  patch?: Partial<StoryPipelineMeta>,
) {
  if (!isNavTraceEnabled() || !active) return;
  if (phases[phase] != null) return;
  phases[phase] = Math.round(now() - origin);
  if (patch) meta = { ...meta, ...patch };
  sync(phase);
}

export function storyPipelineNoteMediaUrl(
  url: string,
  mediaType: StoryMediaType,
  storyId?: string,
) {
  if (!isNavTraceEnabled()) return;
  track(url, { url, mediaType, storyId });
  if (mediaType === "video") {
    storyPipelineMark("video-url-known", { mediaUrl: url, mediaType, storyId });
  }
  storyPipelineMark("media-url-known", { mediaUrl: url, mediaType, storyId });
}

export function storyPipelineMarkPreloadStart(url: string, mediaType: StoryMediaType, storyId?: string) {
  if (!isNavTraceEnabled()) return;
  const row = track(url, { url, mediaType, storyId, preloadStarted: true });
  storyPipelineMark("preload-start", { mediaUrl: url, mediaType, storyId });
  storyPipelineMark("preload-request-start", { mediaUrl: url, mediaType, storyId });
  if (mediaType === "video") {
    storyPipelineMark("video-preload-requested", { mediaUrl: url, mediaType, storyId });
  }
  if (!inputLocked && row.ready) {
    storyPipelineMark("media-ready-before-input", { mediaUrl: url, mediaType, storyId });
  }
}

export function storyPipelineMarkResponseReady(
  url: string,
  mediaType: StoryMediaType,
  storyId?: string,
) {
  if (!isNavTraceEnabled()) return;
  track(url, { url, mediaType, storyId, responseReady: true });
  storyPipelineMark("media-response-ready", { mediaUrl: url, mediaType, storyId });
}

export function storyPipelineMarkImageDecodeReady(
  url: string,
  storyId: string | undefined,
  imgComplete: boolean,
  naturalWidth: number,
  naturalHeight: number,
) {
  if (!isNavTraceEnabled()) return;
  const row = track(url, {
    url,
    mediaType: "image",
    storyId,
    imgComplete,
    naturalWidth,
    naturalHeight,
    decodeReady: imgComplete && naturalWidth > 0,
  });
  storyPipelineMark("image-decode-ready", {
    mediaUrl: url,
    mediaType: "image",
    storyId,
    imgComplete,
    naturalWidth,
    naturalHeight,
  });
  if (!inputLocked && row.ready) {
    storyPipelineMark("media-ready-before-input", {
      mediaUrl: url,
      mediaType: "image",
      storyId,
      imgComplete,
      naturalWidth,
      naturalHeight,
    });
  }
}

export function storyPipelineMarkVideoPhase(
  url: string,
  phase: "loadedmetadata" | "canplay" | "first-frame",
  storyId?: string,
) {
  if (!isNavTraceEnabled()) return;
  const patch: Partial<MediaTrack> = { url, mediaType: "video", storyId };
  if (phase === "loadedmetadata") {
    patch.videoLoadedMetadata = true;
    storyPipelineMark("video-loadedmetadata", { mediaUrl: url, mediaType: "video", storyId });
  } else if (phase === "canplay") {
    patch.videoCanPlay = true;
    storyPipelineMark("video-canplay", { mediaUrl: url, mediaType: "video", storyId });
  } else {
    patch.videoFirstFrame = true;
    storyPipelineMark("video-first-frame", { mediaUrl: url, mediaType: "video", storyId });
  }
  const row = track(url, patch);
  if (!inputLocked && row.ready) {
    storyPipelineMark("media-ready-before-input", { mediaUrl: url, mediaType: "video", storyId });
  }
}

export function storyPipelineIsMediaReady(url?: string) {
  if (!url) return false;
  return mediaByUrl.get(url)?.ready === true;
}

export function storyPipelineMediaState(url?: string) {
  if (!url) return null;
  return mediaByUrl.get(url) || null;
}

export function storyPipelineSnapshot() {
  return {
    phases: { ...phases },
    meta: { ...meta },
    media: Object.fromEntries(mediaByUrl.entries()),
    inputLocked,
  };
}

export function storyPipelineResetMedia() {
  mediaByUrl.clear();
}

export function attachStoryPipelineWindow() {
  if (typeof window === "undefined" || !isNavTraceEnabled()) return;
  window.__sayittomeStoryPipeline = {
    snapshot: storyPipelineSnapshot,
    begin: storyPipelineBegin,
    lockInput: storyPipelineLockInput,
    isMediaReady: storyPipelineIsMediaReady,
    mediaState: storyPipelineMediaState,
    resetMedia: storyPipelineResetMedia,
  };
}

declare global {
  interface Window {
    __sayittomeStoryPipeline?: {
      snapshot: typeof storyPipelineSnapshot;
      begin: typeof storyPipelineBegin;
      lockInput: typeof storyPipelineLockInput;
      isMediaReady: typeof storyPipelineIsMediaReady;
      mediaState: typeof storyPipelineMediaState;
      resetMedia: typeof storyPipelineResetMedia;
    };
    __sayittomeStoriesBench?: {
      getGroups: () => unknown[];
      clearPreload: () => void;
      preloadOwner: (ownerUid: string) => unknown;
      refreshIndex?: () => Promise<void>;
      preloadMediaUrl?: (mediaUrl: string, storyId?: string) => void;
    };
  }
}
