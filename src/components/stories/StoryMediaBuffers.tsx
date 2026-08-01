"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordConsumedBytes } from "@/lib/stories/adaptivePreloadPolicy";
import {
  storyBlankFrameBegin,
  storyBlankFrameEnd,
} from "@/lib/perf/storyBlankFrameTrace";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  storyPipelineMark,
  storyPipelineMarkImageDecodeReady,
  storyPipelineMarkResponseReady,
  storyPipelineMarkVideoPhase,
} from "@/lib/perf/storyPipelineTrace";
import type { StoryItem } from "@/lib/stories/types";

type Slot = {
  storyId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  ready: boolean;
};

type Props = {
  current: StoryItem;
  nextStory: StoryItem | null;
  needsBlur: boolean;
  blurLocked: boolean;
  onNextReadyChange?: (ready: boolean) => void;
  onFrontVideoMetadata?: (durationSec: number) => void;
};

function slotFromStory(story: StoryItem): Slot {
  return {
    storyId: story.id,
    mediaUrl: story.mediaUrl || "",
    mediaType: story.mediaType === "video" ? "video" : "image",
    ready: false,
  };
}

function mediaClass(needsBlur: boolean, blurLocked: boolean, visible: boolean) {
  return [
    "absolute inset-0 m-auto max-h-full max-w-full object-contain",
    visible ? "" : "opacity-0 pointer-events-none",
    needsBlur && blurLocked ? "blur-2xl scale-105" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function StoryMediaBuffers({
  current,
  nextStory,
  needsBlur,
  blurLocked,
  onNextReadyChange,
  onFrontVideoMetadata,
}: Props) {
  const frontRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const backRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const [front, setFront] = useState<Slot>(() => slotFromStory(current));
  const [back, setBack] = useState<Slot | null>(() =>
    nextStory?.mediaUrl ? slotFromStory(nextStory) : null,
  );
  const [showFront, setShowFront] = useState(true);

  const markFrontReady = useCallback(() => {
    setFront((prev) => ({ ...prev, ready: true }));
    storyBlankFrameEnd();
    if (isNavTraceEnabled()) storyPipelineMark("viewer-dom");
    recordConsumedBytes(front.mediaUrl.length);
  }, [front.mediaUrl]);

  const markBackReady = useCallback(() => {
    setBack((prev) => (prev ? { ...prev, ready: true } : prev));
    onNextReadyChange?.(true);
  }, [onNextReadyChange]);

  useEffect(() => {
    onNextReadyChange?.(Boolean(back?.ready));
  }, [back?.ready, onNextReadyChange]);

  useEffect(() => {
    if (current.id === front.storyId && current.mediaUrl === front.mediaUrl) return;

    if (back && back.storyId === current.id && back.mediaUrl === current.mediaUrl && back.ready) {
      setFront(back);
      setBack(nextStory?.mediaUrl ? slotFromStory(nextStory) : null);
      setShowFront(true);
      storyBlankFrameEnd();
      onNextReadyChange?.(false);
      return;
    }

    storyBlankFrameBegin();
    setFront(slotFromStory(current));
    setShowFront(true);
  }, [
    current.id,
    current.mediaUrl,
    current.mediaType,
    front.storyId,
    front.mediaUrl,
    back,
    nextStory?.id,
    nextStory?.mediaUrl,
    onNextReadyChange,
  ]);

  useEffect(() => {
    if (!nextStory?.mediaUrl) {
      setBack(null);
      onNextReadyChange?.(false);
      return;
    }
    if (back?.storyId === nextStory.id && back.mediaUrl === nextStory.mediaUrl) return;
    setBack({ ...slotFromStory(nextStory), ready: false });
    onNextReadyChange?.(false);
  }, [nextStory?.id, nextStory?.mediaUrl, nextStory?.mediaType, back?.storyId, back?.mediaUrl, onNextReadyChange]);

  const frontVisible = showFront;
  const backVisible = !showFront;

  return (
    <div className="relative h-full w-full">
      {front.mediaUrl ? (
        front.mediaType === "video" ? (
          <video
            ref={(node) => {
              frontRef.current = node;
            }}
            key={`front-${front.storyId}`}
            src={front.mediaUrl}
            className={mediaClass(needsBlur, blurLocked, frontVisible)}
            autoPlay
            playsInline
            muted={false}
            preload="auto"
            onLoadedMetadata={(e) => {
              const duration = e.currentTarget.duration;
              if (Number.isFinite(duration) && duration > 0) {
                onFrontVideoMetadata?.(duration);
              }
              if (isNavTraceEnabled()) {
                storyPipelineMarkVideoPhase(front.mediaUrl, "loadedmetadata", front.storyId);
                storyPipelineMarkResponseReady(front.mediaUrl, "video", front.storyId);
              }
            }}
            onLoadedData={markFrontReady}
            onCanPlay={() => {
              if (isNavTraceEnabled()) {
                storyPipelineMarkVideoPhase(front.mediaUrl, "canplay", front.storyId);
              }
            }}
            onPlaying={() => {
              if (isNavTraceEnabled()) {
                storyPipelineMarkVideoPhase(front.mediaUrl, "first-frame", front.storyId);
              }
              markFrontReady();
            }}
          />
        ) : (
          <img
            ref={(node) => {
              frontRef.current = node;
            }}
            key={`front-${front.storyId}`}
            src={front.mediaUrl}
            alt=""
            className={mediaClass(needsBlur, blurLocked, frontVisible)}
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (isNavTraceEnabled()) {
                storyPipelineMarkResponseReady(front.mediaUrl, "image", front.storyId);
                storyPipelineMarkImageDecodeReady(
                  front.mediaUrl,
                  front.storyId,
                  img.complete,
                  img.naturalWidth,
                  img.naturalHeight,
                );
              }
              if (typeof img.decode === "function") {
                void img.decode().then(markFrontReady).catch(markFrontReady);
              } else {
                markFrontReady();
              }
            }}
          />
        )
      ) : null}

      {back?.mediaUrl ? (
        back.mediaType === "video" ? (
          <video
            ref={(node) => {
              backRef.current = node;
            }}
            key={`back-${back.storyId}`}
            src={back.mediaUrl}
            className={mediaClass(needsBlur, blurLocked, backVisible)}
            autoPlay={backVisible}
            playsInline
            muted
            preload={backVisible ? "auto" : "metadata"}
            onCanPlay={markBackReady}
            onPlaying={markBackReady}
          />
        ) : (
          <img
            ref={(node) => {
              backRef.current = node;
            }}
            key={`back-${back.storyId}`}
            src={back.mediaUrl}
            alt=""
            className={mediaClass(needsBlur, blurLocked, backVisible)}
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (typeof img.decode === "function") {
                void img.decode().then(markBackReady).catch(markBackReady);
              } else {
                markBackReady();
              }
            }}
          />
        )
      ) : null}
    </div>
  );
}
