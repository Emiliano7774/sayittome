import {
  assembleShuffleSlotProfiles,
  shuffleProfileDedupeKeys,
  shuffleProfileIdentityKey,
  uniqueShuffleWindow,
} from "@/lib/shuffle/dedupeProfiles";
import {
  applyShuffleAdminTagOverlay,
  mergeStickyShuffleAdminTags,
} from "@/lib/shuffle/shuffleAdminTagOverlay";
import {
  applyShuffleProfileBlurFlags,
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
/** Bumps only when the visible shuffle window is fully replaced (not presence patches). */
let windowGeneration = 0;
const dirtySlots = new Set<number>();
const globalListeners = new Set<() => void>();

/** Deterministic SSR/hydration snapshot; browser slots become visible after hydration. */
export function getServerShuffleSlotsVersion() {
  return 0;
}

function notifyGlobal() {
  slotsVersion += 1;
  globalListeners.forEach((listener) => listener());
}

function flushDirtySlots() {
  if (dirtySlots.size === 0) {
    rafId = null;
    return;
  }

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

function flushShuffleSlotsNow() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (dirtySlots.size === 0) return;
  shuffleMark("shuffle-slots-flush-start");
  flushDirtySlots();
}

function scheduleFlush(options?: { sync?: boolean }) {
  if (options?.sync) {
    flushShuffleSlotsNow();
    return;
  }
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

    if (prev && next && shuffleProfileIdentityKey(prev) === shuffleProfileIdentityKey(next) && shuffleProfileIdentityKey(prev)) {
      const updated: ShuffleProfile = applyShuffleAdminTagOverlay(
        mergeStickyShuffleAdminTags(
          {
            ...prev,
            blurPhoto: next.blurPhoto,
            moderationTag: next.moderationTag,
            fakeProfileTag: next.fakeProfileTag,
            mediaBlurFlags: next.mediaBlurFlags,
            adminBlurProfilePhoto: next.adminBlurProfilePhoto,
            adminBlurFotosPerfil: next.adminBlurFotosPerfil,
            adminBlurGallery: next.adminBlurGallery,
          },
          prev,
        ),
      );

      if (
        prev.blurPhoto !== updated.blurPhoto ||
        prev.moderationTag !== updated.moderationTag ||
        prev.fakeProfileTag !== updated.fakeProfileTag ||
        prev.mediaBlurFlags !== updated.mediaBlurFlags
      ) {
        slots[slot] = updated;
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
  compactShuffleSlotsLeft();
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

export function patchShuffleProfileFakeTag(uid: string, fakeProfileTag: string) {
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (!profile || profile.uid !== uid) continue;

    slots[slot] = { ...profile, fakeProfileTag };
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

export function flushShuffleSlotsSync() {
  scheduleFlush({ sync: true });
}

export function resetShuffleWindowSlots() {
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot] !== null) {
      slots[slot] = null;
      dirtySlots.add(slot);
    }
  }
  windowGeneration += 1;
  scheduleFlush({ sync: true });
}

export function setShuffleSlotsWithFeatured(
  featured: ShuffleProfile[],
  pool: ShuffleProfile[],
  indices: Int32Array,
  count: number,
  forceReplace = false,
) {
  if (forceReplace) {
    for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
      if (slots[slot] !== null) {
        slots[slot] = null;
        dirtySlots.add(slot);
      }
    }
    windowGeneration += 1;
  }

  const unique = assembleShuffleSlotProfiles(
    featured,
    pool,
    indices,
    count,
  );
  const filledCount = Math.min(unique.length, SHUFFLE_WINDOW_SIZE);

  for (let slot = 0; slot < filledCount; slot++) {
    slots[slot] = unique[slot] ?? null;
    dirtySlots.add(slot);
  }

  for (let slot = filledCount; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot] !== null) {
      slots[slot] = null;
      dirtySlots.add(slot);
    }
  }

  compactShuffleSlotsLeft();
  scheduleFlush({ sync: forceReplace });
}

function dedupeFilledSlots() {
  const filled: ShuffleProfile[] = [];
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const profile = slots[slot];
    if (profile) filled.push(profile);
  }

  const unique = uniqueShuffleWindow(filled);
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const next = unique[slot] ?? null;
    if (slots[slot] === next) continue;
    slots[slot] = next;
    dirtySlots.add(slot);
  }
}

function compactShuffleSlotsLeft() {
  const filled: (ShuffleProfile | null)[] = [];

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    if (slots[slot]) filled.push(slots[slot]);
  }

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const next = filled[slot] ?? null;
    if (slots[slot] === next) continue;
    slots[slot] = next;
    dirtySlots.add(slot);
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

export function getShuffleWindowGeneration() {
  return windowGeneration;
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
    for (const key of shuffleProfileDedupeKeys(profile)) lookup.set(key, profile);
    const username = String(profile.username || "").trim().toLowerCase();
    if (username) lookup.set(`u:${username}`, profile);
  }

  let changed = false;

  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const current = slots[slot];
    if (!current) continue;

    let refreshed =
      lookup.get(current.uid) ||
      lookup.get(`u:${String(current.username || "").trim().toLowerCase()}`);
    if (!refreshed) {
      for (const key of shuffleProfileDedupeKeys(current)) {
        refreshed = lookup.get(key);
        if (refreshed) break;
      }
    }
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

/** Drop stale filter members in place; keep remaining order (no reshuffle). */
export function pruneShuffleSlotsToPool(pool: ShuffleProfile[]) {
  const poolKeys = new Set<string>();
  for (const profile of pool) {
    for (const key of shuffleProfileDedupeKeys(profile)) poolKeys.add(key);
  }

  const kept: ShuffleProfile[] = [];
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const current = slots[slot];
    if (!current) continue;
    const stillMember = shuffleProfileDedupeKeys(current).some((key) => poolKeys.has(key));
    if (stillMember) kept.push(current);
  }

  let changed = false;
  for (let slot = 0; slot < SHUFFLE_WINDOW_SIZE; slot++) {
    const next = kept[slot] || null;
    if (slots[slot] === next) continue;
    slots[slot] = next;
    dirtySlots.add(slot);
    changed = true;
  }

  if (changed) {
    patchShuffleSlotPresence(pool);
    scheduleFlush();
  } else {
    patchShuffleSlotPresence(pool);
  }
}
