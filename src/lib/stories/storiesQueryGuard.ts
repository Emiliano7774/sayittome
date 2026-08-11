export function shouldSkipStoriesRefresh(input: {
  force: boolean;
  viewerChanged: boolean;
  now: number;
  lastFetch: number;
  ttlMs: number;
  hasMaterialized: boolean;
}) {
  if (input.force || input.viewerChanged) return false;
  if (!input.hasMaterialized || !input.lastFetch) return false;
  return input.now - input.lastFetch < input.ttlMs;
}

export function previousSeenStateAllowed(input: {
  requestViewer: string;
  storeViewer: string;
  viewerChanged: boolean;
}) {
  return (
    !input.viewerChanged &&
    Boolean(input.requestViewer) &&
    input.requestViewer === input.storeViewer
  );
}

export function shouldPublishStoriesIndex(input: {
  requestToken: number;
  liveToken: number;
  requestViewer: string;
  liveViewer: string;
}) {
  return (
    input.requestToken === input.liveToken &&
    String(input.requestViewer || "") === String(input.liveViewer || "")
  );
}

export const STORIES_SNAPSHOT_TTL_MS = 10 * 60_000;
export const NEXT_MEDIA_READY_TIMEOUT_MS = 2500;

export type StoriesSnapshotWriteSource = "network" | "local";

export function buildStoriesSnapshotWrite<TGroup>(input: {
  viewerUid: string;
  groups: TGroup[];
  previous: {
    viewerUid: string;
    fetchedAtMs: number;
    generation: number;
  } | null;
  source: StoriesSnapshotWriteSource;
  now: number;
  generation?: number;
}) {
  const previous =
    input.previous && input.previous.viewerUid === input.viewerUid
      ? input.previous
      : null;
  const generation =
    input.source === "network"
      ? Number(input.generation || (previous ? previous.generation + 1 : 1))
      : Number(previous?.generation || input.generation || 0);
  const fetchedAtMs =
    input.source === "network" ? input.now : Number(previous?.fetchedAtMs || 0);
  return {
    viewerUid: input.viewerUid,
    groups: input.groups,
    savedAtMs: input.now,
    persistedAtMs: input.now,
    fetchedAtMs,
    generation,
  };
}

export function snapshotFreshnessMs(snapshot: {
  fetchedAtMs?: number;
  savedAtMs?: number;
  persistedAtMs?: number;
}) {
  const fetched = Number(snapshot.fetchedAtMs || 0);
  if (fetched) return fetched;
  return Number(snapshot.savedAtMs || snapshot.persistedAtMs || 0);
}

export function isStoriesSnapshotFresh(savedAtMs: number, now = Date.now()) {
  const saved = Number(savedAtMs || 0);
  if (!saved) return false;
  return now - saved <= STORIES_SNAPSHOT_TTL_MS;
}

export function selectLatestStoriesSnapshot<
  T extends {
    viewerUid: string;
    generation?: number;
    groups: unknown[];
    fetchedAtMs?: number;
    persistedAtMs?: number;
    savedAtMs?: number;
  },
>(current: T | null, incoming: T | null): T | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.viewerUid !== current.viewerUid) return incoming;

  const incomingGeneration = Number(incoming.generation || 0);
  const currentGeneration = Number(current.generation || 0);
  if (incomingGeneration !== currentGeneration) {
    return incomingGeneration > currentGeneration ? incoming : current;
  }

  const incomingFetched = Number(incoming.fetchedAtMs || 0);
  const currentFetched = Number(current.fetchedAtMs || 0);
  if (incomingFetched !== currentFetched) {
    return incomingFetched > currentFetched ? incoming : current;
  }

  const incomingPersisted = Number(incoming.persistedAtMs || incoming.savedAtMs || 0);
  const currentPersisted = Number(current.persistedAtMs || current.savedAtMs || 0);
  if (incomingPersisted !== currentPersisted) {
    return incomingPersisted > currentPersisted ? incoming : current;
  }

  return incoming;
}

export function pickLatestStoriesSnapshot<
  T extends {
    viewerUid: string;
    generation?: number;
    groups: unknown[];
    fetchedAtMs?: number;
    persistedAtMs?: number;
    savedAtMs?: number;
  },
>(candidates: Array<T | null | undefined>, now = Date.now()): T | null {
  void now;
  return candidates
    .filter((row): row is T => Boolean(row?.viewerUid))
    .reduce<T | null>((best, row) => selectLatestStoriesSnapshot(best, row), null);
}

export const STORIES_SNAPSHOT_MAX_GROUPS = 40;
export const STORIES_SNAPSHOT_MAX_STORIES = 20;

export function didTruncateStoriesSnapshot(
  groups: Array<{ stories?: unknown[] }>,
) {
  if (groups.length > STORIES_SNAPSHOT_MAX_GROUPS) return true;
  return groups.some((group) => (group.stories || []).length > STORIES_SNAPSHOT_MAX_STORIES);
}

export function shouldReplayStoryPlayback<T extends { id: string }>(input: {
  stories: T[];
  viewerId: string;
  initialStoryId?: string;
  isUnseen: (story: T, viewerId: string) => boolean;
}) {
  if (!input.viewerId || input.stories.length === 0) return false;
  const allSeen = input.stories.every((story) => !input.isUnseen(story, input.viewerId));
  if (allSeen) return true;
  if (!input.initialStoryId) return false;
  const initial = input.stories.find((story) => story.id === input.initialStoryId);
  return Boolean(initial && !input.isUnseen(initial, input.viewerId));
}

export function isRemoteStoryViewAcked(
  data:
    | {
        viewedBy?: Record<string, boolean>;
        viewedByAnon?: Record<string, boolean>;
      }
    | undefined,
  viewerId: string,
) {
  if (!viewerId || !data) return false;
  if (viewerId.startsWith("anon_")) return data.viewedByAnon?.[viewerId] === true;
  return data.viewedBy?.[viewerId] === true;
}

export function planStoryViewAckTransaction(input: {
  viewerId: string;
  remoteViewed: boolean;
}) {
  const increment = viewAckShouldIncrement({
    viewerId: input.viewerId,
    attempt: 0,
    alreadySeen: input.remoteViewed,
  });
  if (!input.viewerId || input.remoteViewed) {
    return { apply: false, increment: false, viewedField: "" };
  }
  const viewedField = input.viewerId.startsWith("anon_")
    ? `viewedByAnon.${input.viewerId}`
    : `viewedBy.${input.viewerId}`;
  return { apply: true, increment, viewedField };
}

export function isActiveSnapshotStory(story: {
  id?: string;
  adminDeleted?: boolean;
  active?: boolean;
  expiresAtMs?: number;
}, now = Date.now()) {
  if (!story?.id) return false;
  if (story.adminDeleted === true) return false;
  if (story.active === false) return false;
  if (story.expiresAtMs && story.expiresAtMs <= now) return false;
  return true;
}

export function shouldReleaseMediaGate(input: {
  hasUrl: boolean;
  ready: boolean;
  timedOut?: boolean;
  errored?: boolean;
}) {
  if (!input.hasUrl) return true;
  return input.ready === true || input.timedOut === true || input.errored === true;
}

export type NextPlayTarget<TGroup> = {
  kind: "same-group" | "next-group" | "exit";
  group: TGroup | null;
  storyIndex: number;
};

export function nextUnseenIndexAfter<T extends { id: string }>(
  stories: T[],
  fromIndex: number,
  viewerId: string,
  isUnseen: (story: T, viewerId: string) => boolean,
) {
  if (!viewerId) return -1;
  for (let i = fromIndex + 1; i < stories.length; i += 1) {
    if (isUnseen(stories[i], viewerId)) return i;
  }
  return -1;
}

export function resolveNextPlayTarget<TStory extends { id: string }, TGroup extends { ownerUid: string; stories: TStory[] }>(input: {
  viewerId: string;
  currentOwnerUid: string;
  currentIndex: number;
  currentStories: TStory[];
  groups: TGroup[];
  replay?: boolean;
  isUnseen: (story: TStory, viewerId: string) => boolean;
  groupIsUnseen: (group: TGroup, viewerId: string) => boolean;
}): NextPlayTarget<TGroup> {
  const { viewerId, currentIndex, currentStories, replay } = input;
  if (!viewerId) {
    return { kind: "same-group", group: null, storyIndex: currentIndex };
  }
  if (replay) {
    if (currentIndex + 1 < currentStories.length) {
      return { kind: "same-group", group: null, storyIndex: currentIndex + 1 };
    }
    return { kind: "exit", group: null, storyIndex: -1 };
  }
  const same = nextUnseenIndexAfter(currentStories, currentIndex, viewerId, input.isUnseen);
  if (same >= 0) {
    return { kind: "same-group", group: null, storyIndex: same };
  }
  const nextGroup = nextUnseenGroupAfter(
    input.groups,
    input.currentOwnerUid,
    viewerId,
    input.groupIsUnseen,
  );
  if (!nextGroup) return { kind: "exit", group: null, storyIndex: -1 };
  const nextIndex = firstUnseenStoryIndex(nextGroup.stories, viewerId, input.isUnseen);
  return {
    kind: "next-group",
    group: nextGroup,
    storyIndex: nextIndex >= 0 ? nextIndex : 0,
  };
}

export function firstUnseenStoryIndex<T extends { id: string }>(
  stories: T[],
  viewerId: string,
  isUnseen: (story: T, viewerId: string) => boolean,
) {
  if (!viewerId) return -1;
  return stories.findIndex((story) => isUnseen(story, viewerId));
}

export function nextUnseenGroupAfter<T extends { ownerUid: string; stories: unknown[] }>(
  groups: T[],
  currentOwnerUid: string,
  viewerId: string,
  groupIsUnseen: (group: T, viewerId: string) => boolean,
) {
  if (!viewerId) return null;
  const start = groups.findIndex((group) => group.ownerUid === currentOwnerUid);
  const from = start >= 0 ? start + 1 : 0;
  for (let i = from; i < groups.length; i += 1) {
    if (groupIsUnseen(groups[i], viewerId)) return groups[i];
  }
  return null;
}

export function isStoryViewerUsefulPaint(input: {
  current?: { id?: string; mediaUrl?: string; texto?: string } | null;
  frontReady?: boolean;
  errored?: boolean;
}) {
  if (!input.current?.id) return false;
  if (input.errored) return false;
  if (!input.current.mediaUrl) return Boolean(String(input.current.texto || "").trim());
  return input.frontReady === true;
}

export function shouldStartStoryProgress(input: {
  viewerReady: boolean;
  hasMediaUrl: boolean;
  mediaType?: string;
  frontReady: boolean;
  errored?: boolean;
  durationMs?: number;
}) {
  if (!input.viewerReady || input.errored) return false;
  if (!input.hasMediaUrl) return true;
  if (input.frontReady !== true) return false;
  if (input.mediaType === "video" && !(Number(input.durationMs) > 0)) return false;
  return true;
}

export function shouldMarkStoryViewed(input: {
  viewerReady: boolean;
  hasMediaUrl: boolean;
  mediaType?: string;
  frontReady: boolean;
  errored?: boolean;
  durationMs?: number;
}) {
  return shouldStartStoryProgress(input);
}

export function viewAckShouldIncrement(input: {
  viewerId: string;
  attempt: number;
  alreadySeen: boolean;
}) {
  if (!input.viewerId) return false;
  if (input.attempt > 0) return false;
  if (input.alreadySeen) return false;
  return true;
}
