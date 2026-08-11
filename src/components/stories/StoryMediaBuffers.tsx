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
import { NEXT_MEDIA_READY_TIMEOUT_MS } from "@/lib/stories/storiesQueryGuard";
import {
  acceptMediaSlotEvent,
  applyMediaSlotMutation,
  durationFromPromotedElement,
  emptyMediaSlot,
  mediaElementUrl,
  mediaSlotDomKey,
  mediaSlotFromStory,
  otherMediaSlot,
  planMediaSlotPromotion,
  type MediaSlotEvent,
  type MediaSlotId,
  type MediaSlotState,
} from "@/lib/stories/storyMediaSlots";
import type { StoryItem } from "@/lib/stories/types";

type Props = {
  current: StoryItem;
  nextStory: StoryItem | null;
  needsBlur: boolean;
  blurLocked: boolean;
  onNextReadyChange?: (ready: boolean) => void;
  onFrontReady?: () => void;
  onFrontError?: () => void;
  onFrontVideoMetadata?: (event: MediaSlotEvent) => void;
};

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
  onFrontReady,
  onFrontError,
  onFrontVideoMetadata,
}: Props) {
  const refs = {
    a: useRef<HTMLImageElement | HTMLVideoElement | null>(null),
    b: useRef<HTMLImageElement | HTMLVideoElement | null>(null),
  };
  const [active, setActive] = useState<MediaSlotId>("a");
  const [slots, setSlots] = useState<Record<MediaSlotId, MediaSlotState>>(() => ({
    a: current.mediaUrl ? mediaSlotFromStory(current) : emptyMediaSlot(),
    b: nextStory?.mediaUrl ? mediaSlotFromStory(nextStory) : emptyMediaSlot(),
  }));

  const front = slots[active];
  const backId = otherMediaSlot(active);
  const back = slots[backId];
  const frontMatches =
    current.id === front.storyId && current.mediaUrl === front.mediaUrl;

  if (!frontMatches) {
    const plan = planMediaSlotPromotion({
      active,
      currentId: current.id,
      slots,
    });
    if (plan.promoted) {
      setActive(plan.active);
      const nextBack = otherMediaSlot(plan.active);
      if (nextStory?.mediaUrl && slots[nextBack].storyId !== nextStory.id) {
        setSlots((prev) => ({
          ...prev,
          [nextBack]: mediaSlotFromStory(nextStory),
        }));
      }
    } else {
      setSlots((prev) => ({
        ...prev,
        [active]: current.mediaUrl ? mediaSlotFromStory(current) : emptyMediaSlot(),
      }));
    }
  } else if (nextStory?.mediaUrl) {
    if (back.storyId !== nextStory.id || back.mediaUrl !== nextStory.mediaUrl) {
      setSlots((prev) => ({
        ...prev,
        [backId]: mediaSlotFromStory(nextStory),
      }));
    }
  } else if (back.storyId) {
    setSlots((prev) => ({ ...prev, [backId]: emptyMediaSlot() }));
  }

  const emitMetadata = useCallback(
    (event: MediaSlotEvent) => {
      if (
        !acceptMediaSlotEvent(event, {
          storyId: current.id,
          mediaUrl: current.mediaUrl || "",
        })
      ) {
        return;
      }
      onFrontVideoMetadata?.(event);
    },
    [current.id, current.mediaUrl, onFrontVideoMetadata],
  );

  const markSlotReady = useCallback(
    (event: { slotId: MediaSlotId; storyId: string; mediaUrl: string }) => {
      setSlots((prev) => {
        const slot = prev[event.slotId];
        if (!slot?.storyId || slot.ready) return prev;
        return applyMediaSlotMutation(prev, event, { ready: true, errored: false });
      });
    },
    [],
  );

  const markSlotError = useCallback(
    (event: { slotId: MediaSlotId; storyId: string; mediaUrl: string }) => {
      setSlots((prev) => applyMediaSlotMutation(prev, event, { ready: false, errored: true }));
    },
    [],
  );

  const markSlotDuration = useCallback(
    (event: { slotId: MediaSlotId; storyId: string; mediaUrl: string; durationSec: number }) => {
      setSlots((prev) =>
        applyMediaSlotMutation(prev, event, { durationSec: event.durationSec }),
      );
    },
    [],
  );

  useEffect(() => {
    onNextReadyChange?.(Boolean((back.ready || back.errored) && back.storyId));
  }, [back.ready, back.errored, back.storyId, onNextReadyChange]);

  useEffect(() => {
    if (front.errored && front.storyId === current.id) {
      onFrontError?.();
      return;
    }
    if (front.ready && !front.errored && front.storyId === current.id) {
      onFrontReady?.();
      storyBlankFrameEnd();
      if (isNavTraceEnabled()) storyPipelineMark("viewer-dom");
      recordConsumedBytes(front.mediaUrl.length);
    }
  }, [current.id, front.errored, front.ready, front.storyId, front.mediaUrl, onFrontError, onFrontReady]);

  useEffect(() => {
    if (current.id === front.storyId && current.mediaUrl === front.mediaUrl) {
      storyBlankFrameEnd();
      return;
    }
    storyBlankFrameBegin();
  }, [current.id, current.mediaUrl, front.storyId, front.mediaUrl]);

  useEffect(() => {
    const el = refs[active].current;
    const promoted = slots[active];
    if (!promoted.storyId || promoted.storyId !== current.id) return;
    const durationSec =
      promoted.durationSec ||
      durationFromPromotedElement(el as { duration?: number; readyState?: number } | null);
    if (durationSec > 0) {
      emitMetadata({
        slotId: active,
        storyId: promoted.storyId,
        mediaUrl: promoted.mediaUrl,
        durationSec,
        readyState: Number((el as HTMLVideoElement | null)?.readyState || 0),
        visible: true,
      });
    }
    if (el && "play" in el) {
      void (el as HTMLVideoElement).play?.().catch(() => {});
    }
    if (el && "readyState" in el && Number((el as HTMLVideoElement).readyState || 0) >= 2) {
      const readyEvent = {
        slotId: active,
        storyId: promoted.storyId,
        mediaUrl: mediaElementUrl(el) || promoted.mediaUrl,
      };
      queueMicrotask(() => markSlotReady(readyEvent));
    }
  }, [active, current.id, emitMetadata, markSlotReady, slots]);

  useEffect(() => {
    if (!back.mediaUrl || back.ready || back.errored) return undefined;
    const timer = window.setTimeout(() => {
      onNextReadyChange?.(true);
    }, NEXT_MEDIA_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [back.mediaUrl, back.ready, back.errored, back.storyId, onNextReadyChange]);

  function renderSlot(slotId: MediaSlotId, visible: boolean) {
    const slot = slots[slotId];
    if (!slot.mediaUrl) return null;
    const captured = {
      slotId,
      storyId: slot.storyId,
      mediaUrl: slot.mediaUrl,
    };
    const markReady = (el?: { currentSrc?: string; src?: string } | null) =>
      markSlotReady({
        ...captured,
        mediaUrl: mediaElementUrl(el || null) || captured.mediaUrl,
      });
    if (slot.mediaType === "video") {
      return (
        <video
          ref={(node) => {
            refs[slotId].current = node;
          }}
          key={mediaSlotDomKey(slotId)}
          src={slot.mediaUrl}
          className={mediaClass(needsBlur, blurLocked, visible)}
          autoPlay={visible}
          playsInline
          muted={!visible}
          preload={visible ? "auto" : "metadata"}
          onLoadedMetadata={(e) => {
            const duration = e.currentTarget.duration;
            const durationSec = Number.isFinite(duration) && duration > 0 ? duration : 0;
            const event = {
              ...captured,
              mediaUrl: mediaElementUrl(e.currentTarget) || captured.mediaUrl,
              durationSec,
            };
            markSlotDuration(event);
            emitMetadata({
              slotId: event.slotId,
              storyId: event.storyId,
              mediaUrl: event.mediaUrl,
              durationSec,
              readyState: e.currentTarget.readyState,
              visible,
            });
            if (isNavTraceEnabled()) {
              storyPipelineMarkVideoPhase(slot.mediaUrl, "loadedmetadata", slot.storyId);
              storyPipelineMarkResponseReady(slot.mediaUrl, "video", slot.storyId);
            }
          }}
          onLoadedData={(e) => markReady(e.currentTarget)}
          onCanPlay={(e) => {
            if (isNavTraceEnabled() && visible) {
              storyPipelineMarkVideoPhase(slot.mediaUrl, "canplay", slot.storyId);
            }
            markReady(e.currentTarget);
          }}
          onPlaying={(e) => {
            if (isNavTraceEnabled() && visible) {
              storyPipelineMarkVideoPhase(slot.mediaUrl, "first-frame", slot.storyId);
            }
            markReady(e.currentTarget);
          }}
          onError={(e) =>
            markSlotError({
              ...captured,
              mediaUrl: mediaElementUrl(e.currentTarget) || captured.mediaUrl,
            })
          }
        />
      );
    }
    return (
      <img
        ref={(node) => {
          refs[slotId].current = node;
        }}
        key={mediaSlotDomKey(slotId)}
        src={slot.mediaUrl}
        alt=""
        className={mediaClass(needsBlur, blurLocked, visible)}
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (isNavTraceEnabled() && visible) {
            storyPipelineMarkResponseReady(slot.mediaUrl, "image", slot.storyId);
            storyPipelineMarkImageDecodeReady(
              slot.mediaUrl,
              slot.storyId,
              img.complete,
              img.naturalWidth,
              img.naturalHeight,
            );
          }
          if (typeof img.decode === "function") {
            void img.decode().then(() => markReady(img)).catch(() => markReady(img));
          } else {
            markReady(img);
          }
        }}
        onError={(e) =>
          markSlotError({
            ...captured,
            mediaUrl: mediaElementUrl(e.currentTarget) || captured.mediaUrl,
          })
        }
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      {renderSlot("a", active === "a")}
      {renderSlot("b", active === "b")}
      {front.errored ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-sm font-bold text-white/80">
          No se pudo cargar
        </div>
      ) : null}
    </div>
  );
}
