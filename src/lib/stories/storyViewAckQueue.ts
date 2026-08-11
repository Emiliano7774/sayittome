export type StoryViewAckItem = {
  storyId: string;
  viewerId: string;
  queuedAtMs: number;
};

const STORAGE_KEY = "sayittome:story-view-ack-queue:v1";

let memory: StoryViewAckItem[] = [];
let hydrated = false;

function asId(value: unknown) {
  return String(value || "").trim();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoryViewAckItem[];
    memory = Array.isArray(parsed)
      ? parsed.filter((row) => asId(row?.storyId) && asId(row?.viewerId))
      : [];
  } catch {
    memory = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}

function keyOf(item: { viewerId: string; storyId: string }) {
  return `${item.viewerId}:${item.storyId}`;
}

export function listStoryViewAckQueue(viewerId?: string) {
  hydrate();
  const viewer = asId(viewerId);
  if (!viewer) return [...memory];
  return memory.filter((row) => row.viewerId === viewer);
}

export function enqueueStoryViewAck(storyId: string, viewerId: string) {
  const id = asId(storyId);
  const viewer = asId(viewerId);
  if (!id || !viewer) return { ok: false as const, items: listStoryViewAckQueue(viewer) };
  hydrate();
  if (!memory.some((row) => row.storyId === id && row.viewerId === viewer)) {
    memory = [...memory, { storyId: id, viewerId: viewer, queuedAtMs: Date.now() }];
  }
  const persisted = persist();
  return { ok: persisted !== false, items: listStoryViewAckQueue(viewer) };
}

export function dequeueStoryViewAck(storyId: string, viewerId: string) {
  hydrate();
  const id = asId(storyId);
  const viewer = asId(viewerId);
  memory = memory.filter((row) => !(row.storyId === id && row.viewerId === viewer));
  persist();
  return listStoryViewAckQueue(viewer);
}

export function clearStoryViewAckQueueForViewer(viewerId: string) {
  hydrate();
  const viewer = asId(viewerId);
  memory = viewer ? memory.filter((row) => row.viewerId !== viewer) : [];
  persist();
}

export function retainStoryViewAckQueueForViewer(viewerId: string) {
  hydrate();
  return listStoryViewAckQueue(viewerId);
}

const flushInFlightByViewer = new Map<string, Promise<void>>();

function flushKey(viewerId?: string) {
  return asId(viewerId) || "__all__";
}

export async function runPartitionedAckFlush(
  viewerId: string | undefined,
  ackOne: (storyId: string, viewerId: string) => Promise<unknown>,
) {
  const pending = listStoryViewAckQueue(viewerId);
  for (const item of pending) {
    try {
      await ackOne(item.storyId, item.viewerId);
    } catch {
      // keep durable
    }
  }
}

export function schedulePartitionedAckFlush(
  viewerId: string | undefined,
  ackOne: (storyId: string, viewerId: string) => Promise<unknown>,
) {
  const key = flushKey(viewerId);
  const existing = flushInFlightByViewer.get(key);
  if (existing) return existing;
  const flight = runPartitionedAckFlush(viewerId, ackOne).finally(() => {
    if (flushInFlightByViewer.get(key) === flight) {
      flushInFlightByViewer.delete(key);
    }
  });
  flushInFlightByViewer.set(key, flight);
  return flight;
}

export function resetAckFlushFlightsForTests() {
  flushInFlightByViewer.clear();
}

export function resetStoryViewAckQueueForTests() {
  memory = [];
  hydrated = true;
}

export function ackQueueItemKey(item: { viewerId: string; storyId: string }) {
  return keyOf(item);
}

export function planAckFailureRecovery(persistOk: boolean) {
  return persistOk ? ("keep_pending" as const) : ("rollback" as const);
}
