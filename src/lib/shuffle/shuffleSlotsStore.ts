import { shuffleProfileDedupeKeys, uniqueShuffleWindow } from "@/lib/shuffle/dedupeProfiles";
import type { ShuffleProfile } from "@/lib/shuffle/types";
import { SHUFFLE_WINDOW_SIZE } from "@/lib/shuffle/pickWindow";
import { shuffleCount, shuffleMark, shuffleMeasure } from "@/lib/shuffle/shuffleProfiler";

const slots: (ShuffleProfile | null)[] = Array(SHUFFLE_WINDOW_SIZE).fill(null);
const listeners: Array<Set<() => void>> = Array.from(
  { length: SHUFFLE_WINDOW_SIZE },
  () => new Set(),
);

let rafId: number | null = null;
let slotsVersion = 0;
const dirtySlots = new Set<number>();
const globalListeners = new Set<() => void>();

function notifyGlobal() {
  slotsVersion += 1;
  globalListeners.forEach((listener) => listener());
}

function flushDirtySlots() {
  rafId = null;
  shuffleMark("shuffle-slots-flush-end");

  dirtySlots.forEach((slot) => {
    listeners[slot].forEach((listener) => listener());
    shuffleCount("slotUpdates");
  });

  dirtySlots.clear();
  notifyGlobal();
  shuffleMeasure(
    "shuffle-slots-flush",
    "shuffle-slots-flush-start",
    "shuffle-slots-flush-end",
  );
  shuffleCount("rafFlushes");
}

function scheduleFlush() {
  if (rafId !== null) return;
  shuffleMark("shuffle-slots-flush-start");
  rafId = requestAnimationFrame(flushDirtySlots);
}

export function setShuffleSlots(
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
) {
  const n = Math.min(count, SHUFFLE_WINDOW_SIZE);

  for (let slot = 0; slot < n; slot++) {
    const next = pool[indices[slot]] ?? null;
    const prev = slots[slot];

    if (prev?.uid === next?.uid && prev?.username === next?.username) {
      continue;
    }

    slots[slot] = next;
    dirtySlots.add(slot);
  }

  for (let slot = n; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot] !== null) {
      slots[slot] = null;
      dirtySlots.add(slot);
    }
  }

  scheduleFlush();
}

export function patchShuffleProfileModerationTag(uid: string, moderationTag: string) {
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (!profile || profile.uid !== uid) continue;

    slots[slot] = { ...profile, moderationTag };
    dirtySlots.add(slot);
  }

  scheduleFlush();
}

function profilesShareSlotIdentity(
  left: ShuffleProfile | null,
  right: ShuffleProfile | null,
) {
  if (!left || !right) return false;
  const rightKeys = new Set(shuffleProfileDedupeKeys(right));
  return shuffleProfileDedupeKeys(left).some((key) => rightKeys.has(key));
}

export function setShuffleSlotsWithFeatured(
  featured: ShuffleProfile[],
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
) {
  const used = new Set<string>();
  const uniqueFeatured: ShuffleProfile[] = [];

  for (const profile of featured) {
    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length > 0 && keys.some((key) => used.has(key))) continue;
    for (const key of keys) used.add(key);
    uniqueFeatured.push(profile);
  }

  const featuredCount = Math.min(uniqueFeatured.length, SHUFFLE_WINDOW_SIZE);
  const regularSlots: Array<{ slot: number; profile: ShuffleProfile }> = [];

  for (let slot = 0; slot < count && featuredCount + regularSlots.length < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = pool[indices[slot]];
    if (!profile) continue;

    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length > 0 && keys.some((key) => used.has(key))) continue;
    for (const key of keys) used.add(key);
    regularSlots.push({ slot, profile });
  }

  const regularCount = regularSlots.length;

  for (let slot = 0; slot < featuredCount; slot++) {
    const next = uniqueFeatured[slot] ?? null;
    const prev = slots[slot];
    if (!profilesShareSlotIdentity(prev, next)) {
      slots[slot] = next;
      dirtySlots.add(slot);
    }
  }

  for (let slot = 0; slot < regularCount; slot++) {
    const targetSlot = featuredCount + slot;
    const next = regularSlots[slot]?.profile ?? null;
    const prev = slots[targetSlot];
    if (!profilesShareSlotIdentity(prev, next)) {
      slots[targetSlot] = next;
      dirtySlots.add(targetSlot);
    }
  }

  for (let slot = featuredCount + regularCount; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot] !== null) {
      slots[slot] = null;
      dirtySlots.add(slot);
    }
  }

  scheduleFlush();
}

export function getShuffleSlotProfile(slot: number) {
  return slots[slot];
}

export function subscribeShuffleSlot(slot: number, listener: () => void) {
  listeners[slot].add(listener);
  return () => listeners[slot].delete(listener);
}

export function getShuffleSlotCount() {
  return SHUFFLE_WINDOW_SIZE;
}

export function getShuffleSlotsVersion() {
  return slotsVersion;
}

export function subscribeAllShuffleSlots(listener: () => void) {
  globalListeners.add(listener);
  return () => globalListeners.delete(listener);
}

export function getVisibleShuffleProfiles() {
  const visible: ShuffleProfile[] = [];

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (profile) visible.push(profile);
  }

  return uniqueShuffleWindow(visible);
}
