/**
 * Diagnostic-only main-tab→shuffle trace archive.
 * Survives module remount via globalThis Symbol.for (+ optional short TTL sessionStorage
 * when capture/minimal-physical diag mode is active). Never used for product UI/motor.
 */

export const TRACE_ARCHIVE_GLOBAL_KEY = Symbol.for(
  "sayittome.main-tab-shuffle-trace-archive.v1",
);
export const TRACE_ARCHIVE_SESSION_KEY = "sayittome.mainTabShuffleTraceArchive.v1";
export const TRACE_ARCHIVE_TTL_MS = 60_000;
export const TRACE_ARCHIVE_SCHEMA_VERSION = 1;

const CRITICAL_KINDS = new Set([
  "TRANSITION_BEGIN",
  "TRANSACTION_REF_ASSIGNED",
  "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT",
  "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT",
  "MICRO_SLIDE_TX_PIN_CLEARED",
  "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT",
  "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH",
  "MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX",
  "PHASE_ARMED",
  "PHASE_SLIDING",
  "SETTLED",
  "SETTLE_INITIATED",
  "ABORTED",
  "READINESS_SAMPLE",
  "DESTINATION_READY",
  "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL",
  "MICRO_SLIDE_TRANSITION_PRECOMMIT_WRITTEN",
  "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_ARMED",
  "MICRO_SLIDE_TRANSITION_PRECOMMIT_FRAME_BARRIER_PASSED",
  "MICRO_SLIDE_TRANSITION_FINAL_WRITE_AFTER_PRECOMMIT",
  "MICRO_SLIDE_TRANSITION_ARMING_ABORTED_STALE_TX",
  "MICRO_SLIDE_WAAPI_MOTOR_SELECTED",
  "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED",
  "MICRO_SLIDE_WAAPI_ANIMATION_CREATED",
  "MICRO_SLIDE_WAAPI_ANIMATION_READY",
  "MICRO_SLIDE_WAAPI_ANIMATION_STARTED",
  "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
  "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED",
  "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED",
  "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED",
  "MICRO_SLIDE_WAAPI_CLEANUP_DONE",
  "MICRO_SLIDE_WAAPI_UNAVAILABLE_FALLBACK",
  "MICRO_SLIDE_WAAPI_STALE_TX_ABORT",
  "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED",
  "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL",
  "MICRO_SLIDE_WAAPI_PRECOMMIT_BARRIER_BYPASSED",
  "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REQUESTED",
  "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED",
  "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REJECTED",
  "MICRO_SLIDE_WAAPI_FINISHED_PROMOTED_BY_WATCHDOG",
  "MICRO_SLIDE_WAAPI_FILL_RELEASE_STARTED",
  "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED",
  "MICRO_SLIDE_WAAPI_CANCEL_BEFORE_PHYSICAL",
  "MICRO_SLIDE_WAAPI_CANCEL_AFTER_PHYSICAL",
  "MICRO_SLIDE_WAAPI_TERMINAL_STATE_REDUCED",
  "MICRO_SLIDE_WAAPI_LOGICAL_SETTLE_WITHOUT_PHYSICAL_REJECTED",
  "TRANSITION_END",
  "TRANSITION_END_RECEIVED",
  "POST_SETTLE_ROUTE_BRIDGE_STARTED",
  "POST_SETTLE_ROUTE_BRIDGE_COMPLETED",
  "FINAL_ROUTE_SURFACE_READY",
  "PRESENTATION_OWNERSHIP_TRANSFERRED",
  "TRACE_RING_CREATED",
  "PRESENTATION_RUNTIME_CREATED",
  "LEGACY_REVEAL_EXECUTED",
  "LEGACY_REVEAL_ATTEMPT",
  "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET",
  "TRACE_RING_RESET_WITH_ACTIVE_OR_RECENT_TX",
]);

export type TraceArchiveEvent = {
  kind: string;
  monoMs: number;
  transactionId?: string | null;
  txId?: string | null;
  navSeq?: number | null;
  phase?: string | null;
  source?: string | null;
  pathname?: string | null;
  moduleInstanceId?: string | null;
  transitionModuleInstanceId?: string | null;
  runtimeInstanceId?: string | null;
  traceRingInstanceId?: string | null;
  softCommitGeneration?: number | null;
  note?: string | null;
  reason?: string | null;
  archiveSource?: string;
  [key: string]: unknown;
};

export type TraceArchiveBucket = {
  txId: string;
  events: TraceArchiveEvent[];
  sourceTab: string | null;
  destinationPath: string;
  createdMono: number;
  firstEventMono: number;
  lastEventMono: number;
  navSeq: number | null;
  runtimeInstanceIds: string[];
  moduleInstanceIds: string[];
  traceRingIds: string[];
  softCommitGeneration: number | null;
  archiveReason: string | null;
  archivedAtMono: number | null;
  captureRunId: string | null;
  expiresAt: number;
};

type TraceArchiveStore = {
  schemaVersion: number;
  byTxId: Record<string, TraceArchiveBucket>;
  recentOrphanEvents: TraceArchiveEvent[];
  lastRingArchiveMono: number | null;
};

function monoMs() {
  if (typeof performance === "undefined") return Date.now();
  return Math.round(performance.timeOrigin + performance.now());
}

function isCaptureOrDiagMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem("sayittome:minimal-physical-diag") === "1") return true;
    if (window.sessionStorage.getItem("sayittome:main-tab-shuffle-trace-session") === "1") {
      return true;
    }
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (new URLSearchParams(window.location.search).get("navcapture") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function emptyStore(): TraceArchiveStore {
  return {
    schemaVersion: TRACE_ARCHIVE_SCHEMA_VERSION,
    byTxId: {},
    recentOrphanEvents: [],
    lastRingArchiveMono: null,
  };
}

function getStore(): TraceArchiveStore {
  const g = globalThis as typeof globalThis & {
    [key: symbol]: TraceArchiveStore | undefined;
  };
  let store = g[TRACE_ARCHIVE_GLOBAL_KEY];
  if (!store) {
    store = emptyStore();
    g[TRACE_ARCHIVE_GLOBAL_KEY] = store;
    if (isCaptureOrDiagMode()) {
      try {
        const raw = window.sessionStorage.getItem(TRACE_ARCHIVE_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as TraceArchiveStore;
          if (parsed?.byTxId) store = { ...emptyStore(), ...parsed };
          g[TRACE_ARCHIVE_GLOBAL_KEY] = store;
        }
      } catch {
        /* ignore */
      }
    }
  }
  pruneExpired(store);
  return store;
}

function persistSessionCopy(store: TraceArchiveStore) {
  if (!isCaptureOrDiagMode() || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TRACE_ARCHIVE_SESSION_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

function pruneExpired(store: TraceArchiveStore, now = monoMs()) {
  for (const txId of Object.keys(store.byTxId)) {
    if (store.byTxId[txId].expiresAt <= now) delete store.byTxId[txId];
  }
  store.recentOrphanEvents = store.recentOrphanEvents.filter(
    (e) => (e.monoMs ?? 0) + TRACE_ARCHIVE_TTL_MS > now,
  );
}

function eventTxId(event: TraceArchiveEvent): string | null {
  const id = event.transactionId ?? event.txId ?? null;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function isCritical(kind: string): boolean {
  return CRITICAL_KINDS.has(kind) || /PINNED|PIN_CLEARED|REHYDR|PHASE_|TRANSITION_|TRACE_RING|RUNTIME_CREATED|LEGACY_REVEAL|SOFT_COMMIT/i.test(kind);
}

export function archiveMainTabShuffleTraceEvent(
  event: TraceArchiveEvent,
  extras?: { archiveReason?: string; captureRunId?: string | null },
): void {
  if (!event || typeof event.kind !== "string") return;
  if (!isCritical(event.kind)) return;
  if (!isCaptureOrDiagMode() && typeof window !== "undefined") {
    // Still allow globalThis archive when diag session already enabled via init scripts.
    try {
      if (window.sessionStorage.getItem("sayittome:main-tab-shuffle-trace-session") !== "1") {
        return;
      }
    } catch {
      return;
    }
  }

  const store = getStore();
  const now = monoMs();
  const tagged: TraceArchiveEvent = {
    ...event,
    archiveSource: event.archiveSource ?? "live-ring",
  };
  const txId = eventTxId(tagged);

  if (!txId) {
    store.recentOrphanEvents = [...store.recentOrphanEvents.slice(-80), tagged];
    persistSessionCopy(store);
    return;
  }

  let bucket = store.byTxId[txId];
  if (!bucket) {
    bucket = {
      txId,
      events: [],
      sourceTab: (tagged.source as string) ?? null,
      destinationPath: "/shuffle",
      createdMono: tagged.monoMs ?? now,
      firstEventMono: tagged.monoMs ?? now,
      lastEventMono: tagged.monoMs ?? now,
      navSeq: (tagged.navSeq as number) ?? null,
      runtimeInstanceIds: [],
      moduleInstanceIds: [],
      traceRingIds: [],
      softCommitGeneration: (tagged.softCommitGeneration as number) ?? null,
      archiveReason: extras?.archiveReason ?? null,
      archivedAtMono: null,
      captureRunId: extras?.captureRunId ?? null,
      expiresAt: now + TRACE_ARCHIVE_TTL_MS,
    };
    store.byTxId[txId] = bucket;
  }

  const dedupeKey = `${tagged.monoMs}|${tagged.kind}|${tagged.navSeq ?? ""}|${tagged.archiveSource ?? ""}`;
  if (
    !bucket.events.some(
      (e) => `${e.monoMs}|${e.kind}|${e.navSeq ?? ""}|${e.archiveSource ?? ""}` === dedupeKey,
    )
  ) {
    bucket.events.push(tagged);
    bucket.events.sort((a, b) => (a.monoMs ?? 0) - (b.monoMs ?? 0));
  }
  bucket.lastEventMono = Math.max(bucket.lastEventMono, tagged.monoMs ?? now);
  bucket.firstEventMono = Math.min(bucket.firstEventMono, tagged.monoMs ?? now);
  bucket.expiresAt = now + TRACE_ARCHIVE_TTL_MS;
  if (extras?.archiveReason) bucket.archiveReason = extras.archiveReason;
  if (tagged.navSeq != null) bucket.navSeq = tagged.navSeq as number;
  if (tagged.source) bucket.sourceTab = String(tagged.source);
  const runtimeId = tagged.runtimeInstanceId;
  if (runtimeId && !bucket.runtimeInstanceIds.includes(String(runtimeId))) {
    bucket.runtimeInstanceIds.push(String(runtimeId));
  }
  const moduleId = tagged.transitionModuleInstanceId || tagged.moduleInstanceId;
  if (moduleId && !bucket.moduleInstanceIds.includes(String(moduleId))) {
    bucket.moduleInstanceIds.push(String(moduleId));
  }
  const ringId = tagged.traceRingInstanceId;
  if (ringId && !bucket.traceRingIds.includes(String(ringId))) {
    bucket.traceRingIds.push(String(ringId));
  }
  persistSessionCopy(store);
}

export function archiveMainTabShuffleTraceRingBeforeReset(input: {
  previousEvents: TraceArchiveEvent[];
  previousRingId?: string | null;
  newRingId?: string | null;
  reason?: string;
  activeOrRecentTxId?: string | null;
}): void {
  const { previousEvents, previousRingId, newRingId, reason, activeOrRecentTxId } = input;
  if (!previousEvents?.length && !activeOrRecentTxId) return;

  const now = monoMs();
  const store = getStore();
  store.lastRingArchiveMono = now;

  for (const event of previousEvents || []) {
    archiveMainTabShuffleTraceEvent(
      { ...event, archiveSource: "pre-reset-ring" },
      { archiveReason: reason ?? "TRACE_RING_RESET" },
    );
  }

  const txIds = new Set<string>();
  if (activeOrRecentTxId) txIds.add(activeOrRecentTxId);
  for (const event of previousEvents || []) {
    const id = eventTxId(event);
    if (id) txIds.add(id);
  }

  for (const txId of txIds) {
    archiveMainTabShuffleTraceEvent(
      {
        kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET",
        monoMs: now,
        transactionId: txId,
        note: `previousRing=${previousRingId ?? "none"}|newRing=${newRingId ?? "none"}|events=${previousEvents?.length ?? 0}`,
        archiveSource: "archive-meta",
      },
      { archiveReason: reason ?? "TRACE_RING_RESET" },
    );
    archiveMainTabShuffleTraceEvent(
      {
        kind: "TRACE_RING_RESET_WITH_ACTIVE_OR_RECENT_TX",
        monoMs: now,
        transactionId: txId,
        note: reason ?? "TRACE_RING_RESET",
        archiveSource: "archive-meta",
      },
      { archiveReason: reason ?? "TRACE_RING_RESET" },
    );
    const bucket = store.byTxId[txId];
    if (bucket) {
      bucket.archivedAtMono = now;
      bucket.archiveReason = reason ?? "TRACE_RING_RESET";
    }
  }
  persistSessionCopy(store);
}

export function exportMainTabShuffleTraceArchive(now = monoMs()) {
  const store = getStore();
  pruneExpired(store, now);
  const buckets = Object.values(store.byTxId);
  const events = buckets
    .flatMap((b) => b.events)
    .concat(store.recentOrphanEvents)
    .sort((a, b) => (a.monoMs ?? 0) - (b.monoMs ?? 0));
  return {
    schemaVersion: TRACE_ARCHIVE_SCHEMA_VERSION,
    ttlMs: TRACE_ARCHIVE_TTL_MS,
    byTxId: store.byTxId,
    events,
    bucketCount: buckets.length,
    eventCount: events.length,
    lastRingArchiveMono: store.lastRingArchiveMono,
    captureOrDiagMode: isCaptureOrDiagMode(),
  };
}

export function installMainTabShuffleTraceArchiveHooks() {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, unknown>;
  win.__exportMainTabShuffleTraceArchive = exportMainTabShuffleTraceArchive;
  win.__archiveMainTabShuffleTraceEvent = archiveMainTabShuffleTraceEvent;
}

export function resetMainTabShuffleTraceArchiveForTests() {
  const g = globalThis as typeof globalThis & {
    [key: symbol]: TraceArchiveStore | undefined;
  };
  delete g[TRACE_ARCHIVE_GLOBAL_KEY];
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(TRACE_ARCHIVE_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

if (typeof window !== "undefined") {
  installMainTabShuffleTraceArchiveHooks();
}
