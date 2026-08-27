/**
 * Atomic Shuffle leave/restore: stable cardId + window index + exact scroll.
 * Never overwrite a usable capture with zeros. Back/popstate and Chats→Shuffle
 * share this snapshot — no requery, no reshuffle.
 */

import {
  captureShuffleFeedScroll,
  findShuffleKeepAliveScrollRoot,
  peekShuffleFeedScroll,
} from "@/lib/navigation/shuffleFeedScroll";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import {
  getShuffleWindowGeneration,
  getVisibleShuffleProfiles,
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export const SHUFFLE_VIEWPORT_SNAPSHOT_KEY = "sayittome:shuffle-viewport-snapshot:v1";

export type ShuffleViewportSnapshot = {
  cardId: string;
  index: number;
  cardIds: string[];
  scrollTop: number;
  windowGeneration: number;
  capturedAt: number;
  /** Full window rows at capture — restores exact order even if pool cache refreshed. */
  profiles?: ShuffleProfile[];
};

let ram: ShuffleViewportSnapshot | null = null;

function identityOf(profile: { username?: string; uid?: string }) {
  return (
    shuffleProfileIdentityKey(profile) ||
    String(profile.username || "").trim() ||
    String(profile.uid || "").trim()
  );
}

export function matchShuffleProfileByCardId(
  profile: {
    username?: string;
    uid?: string;
    aliasIds?: string[];
    usernameAliases?: string[];
  },
  cardId: string,
) {
  if (!cardId) return false;
  if (identityOf(profile) === cardId) return true;
  if (String(profile.username || "") === cardId) return true;
  if (String(profile.uid || "") === cardId) return true;
  const aliases = [
    ...(profile.usernameAliases || []),
    ...(profile.aliasIds || []),
  ];
  return aliases.some((alias) => String(alias) === cardId);
}

export function isShuffleFeedAdNode(node: {
  getAttribute?: (name: string) => string | null;
  classList?: { contains?: (name: string) => boolean };
} | null) {
  if (!node) return false;
  if (node.getAttribute?.("data-shuffle-ad") === "1") return true;
  if (node.getAttribute?.("data-ad-slot")) return true;
  return Boolean(node.classList?.contains?.("sayittome-shuffle-ad"));
}

export function collectShuffleFeedCardNodes(
  list: { children?: ArrayLike<unknown> } | null | undefined,
) {
  const children = list?.children ? Array.from(list.children) : [];
  return children.filter((node) => {
    const el = node as {
      classList?: { contains?: (name: string) => boolean };
      getAttribute?: (name: string) => string | null;
    };
    if (!el?.classList) return false;
    if (el.classList.contains?.("sayittome-nav-scroll-spacer")) return false;
    if (isShuffleFeedAdNode(el)) return false;
    return true;
  }) as Array<{
    offsetTop?: number;
    offsetHeight?: number;
    getAttribute?: (name: string) => string | null;
  }>;
}

export function resolveShuffleActiveCardFromFeedNodes(input: {
  nodes: Array<{
    offsetTop?: number;
    offsetHeight?: number;
    getAttribute?: (name: string) => string | null;
  }>;
  scrollTop: number;
  profiles: Array<{ username?: string; uid?: string }>;
}) {
  const cards = input.nodes;
  if (cards.length === 0) return { cardId: "", index: -1 };
  const probe = input.scrollTop + 8;
  let hit = 0;
  for (let i = 0; i < cards.length; i += 1) {
    const top = Number(cards[i].offsetTop || 0);
    const bottom = top + Number(cards[i].offsetHeight || 0);
    if (bottom > probe) {
      hit = i;
      break;
    }
    hit = i;
  }
  const marked = String(cards[hit].getAttribute?.("data-card-id") || "");
  if (marked) {
    const index = input.profiles.findIndex((profile) =>
      matchShuffleProfileByCardId(profile, marked),
    );
    return { cardId: marked, index: index >= 0 ? index : hit };
  }
  const profile = input.profiles[hit];
  return {
    cardId: profile ? identityOf(profile) : "",
    index: profile ? hit : -1,
  };
}

export function isUsableShuffleViewportSnapshot(
  snapshot: ShuffleViewportSnapshot | null | undefined,
): snapshot is ShuffleViewportSnapshot {
  if (!snapshot) return false;
  if (!snapshot.cardId) return false;
  if (!Number.isFinite(snapshot.index) || snapshot.index < 0) return false;
  if (!Number.isFinite(snapshot.scrollTop) || snapshot.scrollTop < 0) return false;
  // Ordered window is enough to prevent reshuffle even if scroll read briefly fails.
  if (Array.isArray(snapshot.cardIds) && snapshot.cardIds.length > 0) return true;
  return snapshot.scrollTop > 0;
}

export function hasUsableShuffleViewportSnapshot() {
  return isUsableShuffleViewportSnapshot(peekShuffleViewportSnapshot());
}

/** Remount / pool-warm must not deal a new window over a captured mid-feed snapshot. */
export function shouldPreserveShuffleWindowOnRestore(input: {
  suppressRefresh: boolean;
  pinnedCount: number;
  visibleCount: number;
}) {
  if (input.suppressRefresh) return true;
  if (hasUsableShuffleViewportSnapshot()) return true;
  if (input.pinnedCount >= 3 && input.visibleCount > 0) return true;
  return false;
}

function persist(snapshot: ShuffleViewportSnapshot | null) {
  cancelShuffleViewportSnapshotRestore();
  ram = snapshot
    ? {
        ...snapshot,
        cardIds: snapshot.cardIds.slice(),
      }
    : null;
  if (typeof window === "undefined") return;
  try {
    if (!snapshot) {
      sessionStorage.removeItem(SHUFFLE_VIEWPORT_SNAPSHOT_KEY);
      return;
    }
    sessionStorage.setItem(SHUFFLE_VIEWPORT_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

function readStored(): ShuffleViewportSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SHUFFLE_VIEWPORT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShuffleViewportSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      cardId: String(parsed.cardId || ""),
      index: Number(parsed.index),
      cardIds: Array.isArray(parsed.cardIds) ? parsed.cardIds.map(String) : [],
      scrollTop: Number(parsed.scrollTop),
      windowGeneration: Number(parsed.windowGeneration) || 0,
      capturedAt: Number(parsed.capturedAt) || 0,
      profiles: Array.isArray(parsed.profiles)
        ? (parsed.profiles as ShuffleProfile[])
        : undefined,
    };
  } catch {
    return null;
  }
}

export function peekShuffleViewportSnapshot() {
  if (ram) return ram;
  ram = readStored();
  return ram;
}

export function resolveShuffleActiveCard(input: {
  profiles: Array<{ username?: string; uid?: string }>;
  scrollTop: number;
  cardHeight?: number;
  cardId?: string;
}) {
  const profiles = input.profiles;
  if (input.cardId) {
    const match = profiles.findIndex((profile) => {
      const id = identityOf(profile);
      return id === input.cardId || String(profile.username || "") === input.cardId;
    });
    if (match >= 0) {
      return { cardId: identityOf(profiles[match]) || input.cardId, index: match };
    }
    return { cardId: input.cardId, index: -1 };
  }
  if (profiles.length === 0) return { cardId: "", index: -1 };
  const height = Math.max(80, input.cardHeight ?? 420);
  const index = Math.max(
    0,
    Math.min(profiles.length - 1, Math.floor(input.scrollTop / height)),
  );
  return { cardId: identityOf(profiles[index]), index };
}

function readLiveScrollTop() {
  const root = findShuffleKeepAliveScrollRoot();
  if (root && Number.isFinite(root.scrollTop) && root.scrollTop > 0) {
    return Math.round(root.scrollTop);
  }
  return 0;
}

function readDomActiveCard(scrollTop: number, profiles: Array<{ username?: string; uid?: string }>) {
  if (typeof document === "undefined") return { cardId: "", index: -1 };
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  const list = host?.querySelector("[data-shuffle-list]");
  if (!list) return { cardId: "", index: -1 };
  return resolveShuffleActiveCardFromFeedNodes({
    nodes: collectShuffleFeedCardNodes(list),
    scrollTop,
    profiles,
  });
}

export function captureShuffleViewportSnapshot(input?: {
  cardId?: string;
  index?: number;
  scrollTop?: number;
  cardIds?: string[];
  profiles?: ShuffleProfile[];
  allowZero?: boolean;
}) {
  const previous = peekShuffleViewportSnapshot();
  const profiles =
    input?.profiles && input.profiles.length > 0
      ? input.profiles
      : getVisibleShuffleProfiles();
  const cardIds =
    input?.cardIds ??
    profiles.map((profile) => identityOf(profile)).filter(Boolean);
  const scrollTop =
    typeof input?.scrollTop === "number"
      ? Math.max(0, Math.round(input.scrollTop))
      : readLiveScrollTop() || peekShuffleFeedScroll();

  if (!input?.allowZero && scrollTop <= 0 && isUsableShuffleViewportSnapshot(previous)) {
    return previous;
  }

  const resolved = (() => {
    if (input?.cardId) {
      const fromId = resolveShuffleActiveCard({
        profiles,
        scrollTop,
        cardId: input.cardId,
      });
      if (fromId.index >= 0) return fromId;
    }
    const fromDom = readDomActiveCard(scrollTop, profiles);
    if (fromDom.index >= 0 && fromDom.cardId) return fromDom;
    if (typeof input?.index === "number" && input.cardId) {
      return { cardId: input.cardId, index: input.index };
    }
    return resolveShuffleActiveCard({
      profiles,
      scrollTop,
      cardId: input?.cardId,
    });
  })();

  const next: ShuffleViewportSnapshot = {
    cardId: resolved.cardId,
    index: resolved.index,
    cardIds,
    scrollTop,
    windowGeneration: getShuffleWindowGeneration(),
    capturedAt: Date.now(),
    profiles: profiles.map((row) => ({ ...row })),
  };

  if (!isUsableShuffleViewportSnapshot(next)) {
    if (isUsableShuffleViewportSnapshot(previous) && !input?.allowZero) {
      return previous;
    }
    return next;
  }

  persist(next);
  captureShuffleFeedScroll(next.scrollTop);
  return next;
}

export const SHUFFLE_SCROLL_RESTORE_TOLERANCE_PX = 4;

let restoreRetryGeneration = 0;

export function cancelShuffleViewportSnapshotRestore() {
  restoreRetryGeneration += 1;
}

export function peekShuffleViewportRestoreGeneration() {
  return restoreRetryGeneration;
}

export function isShuffleScrollRestoreExact(
  actual: number,
  target: number,
  tolerance = SHUFFLE_SCROLL_RESTORE_TOLERANCE_PX,
) {
  return Math.abs(Number(actual) - Number(target)) <= tolerance;
}

export function isShuffleScrollRestoreClampedByHeight(input: {
  actual: number;
  target: number;
  scrollHeight?: number;
  clientHeight?: number;
}) {
  const maxScroll = Math.max(
    0,
    Number(input.scrollHeight || 0) - Number(input.clientHeight || 0),
  );
  return (
    input.target > maxScroll + SHUFFLE_SCROLL_RESTORE_TOLERANCE_PX &&
    input.actual <= maxScroll + SHUFFLE_SCROLL_RESTORE_TOLERANCE_PX
  );
}

export function isShuffleTargetCardAnchored(input: {
  cardId: string;
  scrollTop: number;
  viewportHeight?: number;
  nodes?: Array<{
    offsetTop?: number;
    offsetHeight?: number;
    getAttribute?: (name: string) => string | null;
  }>;
}) {
  if (!input.cardId || !input.nodes?.length) return false;
  const viewportHeight = Math.max(1, Number(input.viewportHeight || 0));
  const viewTop = input.scrollTop;
  const viewBottom = viewTop + viewportHeight;
  return input.nodes.some((node) => {
    const id = String(node.getAttribute?.("data-card-id") || "");
    if (id !== input.cardId) return false;
    const top = Number(node.offsetTop || 0);
    const bottom = top + Number(node.offsetHeight || 0);
    return bottom > viewTop + 8 && top < viewBottom - 8;
  });
}

export function isShuffleRestoreApplySuccess(input: {
  actual: number;
  target: number;
  scrollHeight?: number;
  clientHeight?: number;
  targetCardVisible?: boolean;
}) {
  // Captured scroll is the authority. A merely visible card can sit hundreds
  // of px off the previous position and must not end retries.
  void input.scrollHeight;
  void input.clientHeight;
  void input.targetCardVisible;
  return isShuffleScrollRestoreExact(input.actual, input.target);
}

function defaultApplyShuffleRestoreScroll(target: number) {
  const root = findShuffleKeepAliveScrollRoot();
  if (!root) return false;
  root.scrollTop = target;
  return isShuffleRestoreApplySuccess({
    actual: Number(root.scrollTop || 0),
    target,
    scrollHeight: Number(root.scrollHeight || 0),
    clientHeight: Number(root.clientHeight || 0),
  });
}

export function restoreShuffleViewportSnapshot(options?: {
  applyScroll?: (scrollTop: number) => boolean;
  attempts?: number;
  schedule?: (cb: () => void) => void;
}) {
  const snapshot = peekShuffleViewportSnapshot();
  if (!isUsableShuffleViewportSnapshot(snapshot)) return null;

  const token = ++restoreRetryGeneration;
  const apply =
    options?.applyScroll ??
    ((scrollTop: number) => defaultApplyShuffleRestoreScroll(scrollTop));

  if (apply(snapshot.scrollTop)) return snapshot;

  const maxAttempts = Math.max(1, Math.min(options?.attempts ?? 8, 12));
  const schedule =
    options?.schedule ??
    ((cb: () => void) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(cb);
        return;
      }
      setTimeout(cb, 0);
    });
  let attempt = 1;
  const tick = () => {
    if (token !== restoreRetryGeneration) return;
    if (apply(snapshot.scrollTop)) return;
    if (attempt >= maxAttempts) return;
    attempt += 1;
    schedule(tick);
  };
  schedule(tick);
  return snapshot;
}

export function clearShuffleViewportSnapshot() {
  persist(null);
}
