export type MediaSlotId = "a" | "b";

export type MediaSlotState = {
  storyId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  ready: boolean;
  errored: boolean;
  durationSec: number;
};

export function emptyMediaSlot(): MediaSlotState {
  return {
    storyId: "",
    mediaUrl: "",
    mediaType: "image",
    ready: false,
    errored: false,
    durationSec: 0,
  };
}

export function mediaSlotFromStory(story: {
  id: string;
  mediaUrl?: string;
  mediaType?: string;
}): MediaSlotState {
  return {
    storyId: story.id,
    mediaUrl: String(story.mediaUrl || ""),
    mediaType: story.mediaType === "video" ? "video" : "image",
    ready: false,
    errored: false,
    durationSec: 0,
  };
}

export function otherMediaSlot(active: MediaSlotId): MediaSlotId {
  return active === "a" ? "b" : "a";
}

export function planMediaSlotPromotion(input: {
  active: MediaSlotId;
  currentId: string;
  slots: Record<MediaSlotId, MediaSlotState>;
}) {
  const back = otherMediaSlot(input.active);
  const backSlot = input.slots[back];
  if (backSlot.storyId === input.currentId && backSlot.mediaUrl) {
    return { active: back, promoted: true };
  }
  return { active: input.active, promoted: false };
}

export function videoDurationMsFromMetadata(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.round(durationSec * 1000);
}

export function mediaSlotDomKey(slotId: MediaSlotId) {
  return `slot-${slotId}`;
}

export type MediaSlotEvent = {
  slotId: MediaSlotId;
  storyId: string;
  mediaUrl: string;
  durationSec?: number;
  readyState?: number;
  visible: boolean;
};

export function acceptMediaSlotEvent(
  event: MediaSlotEvent,
  expected: { storyId: string; mediaUrl: string; slotId?: MediaSlotId },
) {
  if (event.storyId !== expected.storyId) return false;
  if (event.mediaUrl !== expected.mediaUrl) return false;
  if (expected.slotId && event.slotId !== expected.slotId) return false;
  return true;
}

export function mediaElementUrl(el: { currentSrc?: string; src?: string } | null) {
  return String(el?.currentSrc || el?.src || "").trim();
}

export function applyMediaSlotMutation(
  prev: Record<MediaSlotId, MediaSlotState>,
  expected: { slotId: MediaSlotId; storyId: string; mediaUrl: string },
  patch: Partial<MediaSlotState>,
) {
  const slot = prev[expected.slotId];
  if (!slot) return prev;
  if (
    !acceptMediaSlotEvent(
      {
        slotId: expected.slotId,
        storyId: expected.storyId,
        mediaUrl: expected.mediaUrl,
        visible: true,
      },
      { storyId: slot.storyId, mediaUrl: slot.mediaUrl, slotId: expected.slotId },
    )
  ) {
    return prev;
  }
  return {
    ...prev,
    [expected.slotId]: { ...slot, ...patch },
  };
}

export function durationFromPromotedElement(el: {
  duration?: number;
  readyState?: number;
} | null) {
  const duration = Number(el?.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration;
}

export function promotedSlotKeepsNode(
  prevActive: MediaSlotId,
  nextActive: MediaSlotId,
  slotId: MediaSlotId,
) {
  return prevActive !== nextActive && mediaSlotDomKey(slotId) === `slot-${slotId}`;
}

export function shouldPersistVideoDuration(input: {
  storyId: string;
  durationMs: number;
  writtenForId: string;
}) {
  if (!input.storyId || input.durationMs <= 0) return false;
  return input.writtenForId !== input.storyId;
}
