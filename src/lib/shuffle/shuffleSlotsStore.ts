import { shuffleProfileDedupeKeys, uniqueShuffleWindow } from "@/lib/shuffle/dedupeProfiles";
import {
  applyShuffleProfileBlurFlags,
  resolveShuffleProfileBlurPhoto,
} from "@/lib/shuffle/resolveShuffleBlur";
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
      const mergedFlags = {
        ...(next.mediaBlurFlags || {}),
        ...(prev.mediaBlurFlags || {}),
      };
      const merged: ShuffleProfile = {
        ...prev,
        moderationTag: next.moderationTag || prev.moderationTag,
        mediaBlurFlags: mergedFlags,
        blurPhoto: resolveShuffleProfileBlurPhoto(
          { ...prev, mediaBlurFlags: mergedFlags },
          mergedFlags,
        ),
      };

      if (
        prev.blurPhoto !== merged.blurPhoto ||
        prev.moderationTag !== merged.moderationTag
      ) {
        slots[slot] = merged;
        dirtySlots.add(slot);
      }
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

  dedupeFilledSlots();
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

export function patchShuffleProfileBlurFlags(
  uid: string,
  mediaBlurFlags: Record<string, boolean>,
) {
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (!profile || profile.uid !== uid) continue;

    slots[slot] = applyShuffleProfileBlurFlags(profile, mediaBlurFlags);
    dirtySlots.add(slot);
  }

  scheduleFlush();
}

export function setShuffleSlotsWithFeatured(
  featured: ShuffleProfile[],
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
  _forceReplace = false,
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
    slots[slot] = next;
    dirtySlots.add(slot);
  }

  for (let slot = 0; slot < regularCount; slot++) {
    const targetSlot = featuredCount + slot;
    slots[targetSlot] = regularSlots[slot]?.profile ?? null;
    dirtySlots.add(targetSlot);
  }

  for (let slot = featuredCount + regularCount; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot] !== null) {
      slots[slot] = null;
      dirtySlots.add(slot);
    }
  }

  dedupeFilledSlots();
  scheduleFlush();
}

function dedupeFilledSlots() {
  const used = new Set<string>();

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (!profile) continue;

    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length > 0 && keys.some((key) => used.has(key))) {
      slots[slot] = null;
      dirtySlots.add(slot);
      continue;
    }

    for (const key of keys) used.add(key);
  }
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

/** Refresh online badges in the current window without reshuffling identities. */
export function patchShuffleSlotPresence(pool: ShuffleProfile[]) {
  if (pool.length === 0) return;

  const lookup = new Map<string, ShuffleProfile>();
  for (const profile of pool) {
    lookup.set(profile.uid, profile);
    const username = String(profile.username || "").trim().toLowerCase();
    if (username) lookup.set(`u:${username}`, profile);
  }

  let changed = false;

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const current = slots[slot];
    if (!current) continue;

    const refreshed =
      lookup.get(current.uid) ||
      lookup.get(`u:${String(current.username || "").trim().toLowerCase()}`);
    if (!refreshed) continue;

    if (
      current.showOnline === refreshed.showOnline &&
      current.lastActive === refreshed.lastActive &&
      current.presenceAt === refreshed.presenceAt
    ) {
      continue;
    }

    slots[slot] = {
      ...current,
      showOnline: refreshed.showOnline,
      lastActive: refreshed.lastActive,
      presenceAt: refreshed.presenceAt,
    };
    dirtySlots.add(slot);
    changed = true;
  }

  if (changed) scheduleFlush();
}
