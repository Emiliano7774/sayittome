/**
 * Main-tab → shuffle transition trace export — only when ?navcapture=1 (or session carry).
 * Persists to sessionStorage so SPA hops survive without URL query params.
 */

import { isNavCaptureEnabled } from "@/lib/perf/navCaptureDiag";
import {
  archiveMainTabShuffleTraceEvent,
  archiveMainTabShuffleTraceRingBeforeReset,
  installMainTabShuffleTraceArchiveHooks,
} from "@/lib/perf/mainTabShuffleTraceArchive";

export const TRACE_RING_SESSION_KEY = "sayittome:main-tab-to-shuffle-trace-ring";
export const TRACE_RING_META_SESSION_KEY = "sayittome:main-tab-to-shuffle-trace-ring-meta";
export const TRACE_SESSION_ENABLED_KEY = "sayittome:main-tab-shuffle-trace-session";
export const ACCUMULATION_SESSION_KEY = "sayittome:main-tab-shuffle-accumulation";

const RING_MAX = 480;

export type MainTabShuffleDiagTraceKind =
  | "TRANSITION_BEGIN"
  | "NAVIGATION_COMMIT_NOTIFIED"
  | "READINESS_LOOP_STARTED"
  | "READINESS_SAMPLE"
  | "DESTINATION_READY"
  | "PHASE_ARMED"
  | "STAGE_INITIAL_POSITIONS_APPLIED"
  | "PHASE_SLIDING"
  | "TRANSITION_END"
  | "SETTLED"
  | "ABORTED"
  | "PRESENTATION_LATCH_ACQUIRED"
  | "PRESENTATION_LATCH_RELEASED"
  | "POST_SETTLE_ROUTE_BRIDGE_STARTED"
  | "FINAL_ROUTE_READINESS_SAMPLE"
  | "FINAL_ROUTE_SURFACE_READY"
  | "PRESENTATION_OWNERSHIP_TRANSFER_STARTED"
  | "PRESENTATION_OWNERSHIP_TRANSFERRED"
  | "POST_SETTLE_ROUTE_BRIDGE_COMPLETED"
  | "FINAL_ROUTE_HANDOFF_FAILSAFE"
  | "TRANSACTION_CLEANUP_STARTED"
  | "TRANSACTION_CLEANUP_COMPLETED"
  | "STAGE_MOUNTED"
  | "STAGE_UNMOUNTED"
  | "LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER"
  | "ACTIVE_TRANSACTION_WITH_NO_PRESENTED_OWNER";

export type TraceRingIdentity = {
  traceRingInstanceId: string;
  traceRingCreatedMono: number;
};

export type MainTabShuffleDiagTraceEvent = {
  kind: MainTabShuffleDiagTraceKind | string;
  monoMs: number;
  navSeq: number;
  pathname: string;
  phase: string;
  source?: string | null;
  direction?: string | null;
  activeTxPresent?: boolean;
  presentationOwner?: number | null;
  presentationLatchActive?: boolean;
  stageMounted?: boolean;
  slideDatasetValue?: string | null;
  restorableSlots?: number;
  domSlots?: number;
  readiness?: unknown;
  legacy?: unknown;
  note?: string;
  transactionId?: string | null;
  transitionModuleInstanceId?: string;
  transitionModuleCreatedMono?: number;
  traceRingInstanceId?: string;
  traceRingCreatedMono?: number;
  caller?: string;
  reason?: string;
  timerId?: string | null;
  slideFailsafeTimerId?: string | null;
  scheduledTransactionId?: string | null;
  currentTransactionId?: string | null;
  currentPhase?: string | null;
  expectedFireMono?: number | null;
  shuffleHostInstanceId?: string | null;
  stageInstanceId?: string | null;
  sourceSurfaceInstanceId?: string | null;
  destinationSurfaceInstanceId?: string | null;
  hostInstanceId?: string | null;
  eventTargetHostInstanceId?: string | null;
  propertyName?: string | null;
  elapsedTime?: number | null;
  previousPathname?: string | null;
  nextPathname?: string | null;
  presentationLatchNavSeq?: number | null;
  postSettleBridgeActive?: boolean;
  warmIntentActive?: boolean;
  shouldBlockLegacyShufflePresentation?: boolean;
  blockReason?: string | null;
};

let memoryTraceRingIdentity: TraceRingIdentity | null = null;
let traceRingIdentityCounter = 0;
/** In-memory ring used when minimal-physical-diag defers sessionStorage writes during slide. */
let memoryOnlyRing: MainTabShuffleDiagTraceEvent[] = [];

export const MINIMAL_PHYSICAL_DIAG_SESSION_KEY = "sayittome:minimal-physical-diag";

function isMinimalPhysicalDiagMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(MINIMAL_PHYSICAL_DIAG_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function isSlideWindowActive(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.documentElement?.getAttribute("data-main-tab-shuffle-slide");
  return v === "armed" || v === "running" || v === "preparing";
}

function monoMsNow() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function createTraceRingIdentity(): TraceRingIdentity {
  traceRingIdentityCounter += 1;
  const createdMono = monoMsNow();
  return {
    traceRingInstanceId: `trace-ring-${createdMono}-${traceRingIdentityCounter}`,
    traceRingCreatedMono: createdMono,
  };
}

function readTraceRingMeta(): TraceRingIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRACE_RING_META_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TraceRingIdentity;
    if (!parsed?.traceRingInstanceId || !parsed?.traceRingCreatedMono) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTraceRingMeta(identity: TraceRingIdentity) {
  if (typeof window === "undefined") return;
  if (isMinimalPhysicalDiagMode() && isSlideWindowActive()) return;
  if (isMinimalPhysicalDiagMode()) return;
  try {
    window.sessionStorage.setItem(TRACE_RING_META_SESSION_KEY, JSON.stringify(identity));
  } catch {
    /* ignore */
  }
}

function emitTraceRingLifecycleEvent(
  kind: "TRACE_RING_CREATED" | "TRACE_RING_REUSED" | "TRACE_RING_REPLACED",
  identity: TraceRingIdentity,
  extras?: Partial<MainTabShuffleDiagTraceEvent>,
) {
  const entry: MainTabShuffleDiagTraceEvent = {
    kind,
    monoMs: monoMsNow(),
    navSeq: 0,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    phase: "idle",
    traceRingInstanceId: identity.traceRingInstanceId,
    traceRingCreatedMono: identity.traceRingCreatedMono,
    ...extras,
  };
  const ring = [...readRing().slice(-RING_MAX + 1), entry];
  writeRing(ring);
}

export function getTraceRingIdentity(): TraceRingIdentity | null {
  return memoryTraceRingIdentity ?? readTraceRingMeta();
}

export function ensureTraceRingIdentity(): TraceRingIdentity | null {
  if (!isMainTabShuffleTraceDiagEnabled() || typeof window === "undefined") return null;

  const persistedMeta = readTraceRingMeta();
  const persistedRing = readRing();

  if (!memoryTraceRingIdentity) {
    if (persistedMeta) {
      memoryTraceRingIdentity = persistedMeta;
      emitTraceRingLifecycleEvent("TRACE_RING_REUSED", persistedMeta, {
        note: persistedRing.length ? `entries=${persistedRing.length}` : "entries=0",
      });
    } else {
      const previousEvents = memoryOnlyRing.slice();
      const previousRingId =
        previousEvents[previousEvents.length - 1]?.traceRingInstanceId ?? null;
      const activeOrRecentTxId =
        [...previousEvents]
          .reverse()
          .map((e) => e.transactionId ?? e.currentTransactionId ?? null)
          .find((id) => typeof id === "string" && id.length > 0) ?? null;
      memoryTraceRingIdentity = createTraceRingIdentity();
      if (previousEvents.length > 0 || activeOrRecentTxId) {
        archiveMainTabShuffleTraceRingBeforeReset({
          previousEvents,
          previousRingId,
          newRingId: memoryTraceRingIdentity.traceRingInstanceId,
          reason: "TRACE_RING_CREATED_WHILE_PRIOR_EVENTS_OR_TX",
          activeOrRecentTxId,
        });
      }
      writeTraceRingMeta(memoryTraceRingIdentity);
      emitTraceRingLifecycleEvent("TRACE_RING_CREATED", memoryTraceRingIdentity, {
        note: activeOrRecentTxId
          ? `archivedPriorTx=${activeOrRecentTxId}|priorEvents=${previousEvents.length}`
          : `priorEvents=${previousEvents.length}`,
      });
      archiveMainTabShuffleTraceEvent({
        kind: "TRACE_RING_CREATED",
        monoMs: memoryTraceRingIdentity.traceRingCreatedMono,
        transactionId: activeOrRecentTxId,
        traceRingInstanceId: memoryTraceRingIdentity.traceRingInstanceId,
        note: `priorEvents=${previousEvents.length}`,
        archiveSource: "ring-lifecycle",
      });
    }
    return memoryTraceRingIdentity;
  }

  if (persistedMeta && persistedMeta.traceRingInstanceId !== memoryTraceRingIdentity.traceRingInstanceId) {
    const previous = memoryTraceRingIdentity;
    memoryTraceRingIdentity = persistedMeta;
    emitTraceRingLifecycleEvent("TRACE_RING_REPLACED", persistedMeta, {
      note: `previous=${previous.traceRingInstanceId}|reason=session-meta-mismatch`,
    });
    return memoryTraceRingIdentity;
  }

  writeTraceRingMeta(memoryTraceRingIdentity);
  return memoryTraceRingIdentity;
}

export type HopAccumulationCounters = {
  stageMountCount: number;
  stageUnmountCount: number;
  latchAcquireCount: number;
  latchReleaseCount: number;
  cleanupStartedCount: number;
  cleanupCompletedCount: number;
  transitionBeginCount: number;
  abortedCount: number;
  settledCount: number;
};

function readRing(): MainTabShuffleDiagTraceEvent[] {
  if (typeof window === "undefined") return [];
  if (isMinimalPhysicalDiagMode() && memoryOnlyRing.length > 0) {
    return memoryOnlyRing.slice();
  }
  try {
    const raw = window.sessionStorage.getItem(TRACE_RING_SESSION_KEY);
    if (!raw) return memoryOnlyRing.slice();
    const parsed = JSON.parse(raw) as MainTabShuffleDiagTraceEvent[];
    const stored = Array.isArray(parsed) ? parsed : [];
    if (isMinimalPhysicalDiagMode() && memoryOnlyRing.length > 0) {
      return memoryOnlyRing.slice();
    }
    return stored.length >= memoryOnlyRing.length ? stored : memoryOnlyRing.slice();
  } catch {
    return memoryOnlyRing.slice();
  }
}

function writeRing(ring: MainTabShuffleDiagTraceEvent[]) {
  if (typeof window === "undefined") return;
  memoryOnlyRing = ring.slice(-RING_MAX);
  // Minimal physical diag: never touch sessionStorage while slide window is active.
  if (isMinimalPhysicalDiagMode() && isSlideWindowActive()) {
    return;
  }
  if (isMinimalPhysicalDiagMode()) {
    // Still defer heavy stringify until flush helper is called; keep memory only until flush.
    return;
  }
  try {
    window.sessionStorage.setItem(TRACE_RING_SESSION_KEY, JSON.stringify(ring));
  } catch {
    /* ignore quota */
  }
}

/** Post-hop flush for minimal-physical-diag — tooling only. */
export function flushMainTabShuffleTraceRingToSessionStorage() {
  if (typeof window === "undefined") return memoryOnlyRing.slice();
  try {
    window.sessionStorage.setItem(TRACE_RING_SESSION_KEY, JSON.stringify(memoryOnlyRing.slice(-RING_MAX)));
    if (memoryTraceRingIdentity) {
      window.sessionStorage.setItem(
        TRACE_RING_META_SESSION_KEY,
        JSON.stringify(memoryTraceRingIdentity),
      );
    }
  } catch {
    /* ignore */
  }
  return memoryOnlyRing.slice();
}

function readAccumulation(): HopAccumulationCounters {
  const defaults: HopAccumulationCounters = {
    stageMountCount: 0,
    stageUnmountCount: 0,
    latchAcquireCount: 0,
    latchReleaseCount: 0,
    cleanupStartedCount: 0,
    cleanupCompletedCount: 0,
    transitionBeginCount: 0,
    abortedCount: 0,
    settledCount: 0,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.sessionStorage.getItem(ACCUMULATION_SESSION_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<HopAccumulationCounters>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function writeAccumulation(counters: HopAccumulationCounters) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACCUMULATION_SESSION_KEY, JSON.stringify(counters));
  } catch {
    /* ignore */
  }
}

function bumpAccumulation(field: keyof HopAccumulationCounters) {
  if (isMinimalPhysicalDiagMode() && isSlideWindowActive()) {
    // Skip sessionStorage accumulation writes during slide in minimal mode.
    return;
  }
  const counters = readAccumulation();
  counters[field] += 1;
  writeAccumulation(counters);
}

export function isMainTabShuffleTraceDiagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (isNavCaptureEnabled()) {
    try {
      window.sessionStorage.setItem(TRACE_SESSION_ENABLED_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }
  try {
    return window.sessionStorage.getItem(TRACE_SESSION_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistMainTabShuffleTraceEntry(entry: MainTabShuffleDiagTraceEvent) {
  if (!isMainTabShuffleTraceDiagEnabled()) return;
  const identity = ensureTraceRingIdentity();
  const enriched: MainTabShuffleDiagTraceEvent = {
    ...entry,
    traceRingInstanceId: entry.traceRingInstanceId ?? identity?.traceRingInstanceId,
    traceRingCreatedMono: entry.traceRingCreatedMono ?? identity?.traceRingCreatedMono,
  };
  const ring = [...readRing().slice(-RING_MAX + 1), enriched];
  writeRing(ring);
  archiveMainTabShuffleTraceEvent({
    ...enriched,
    archiveSource: "live-ring",
  });

  switch (entry.kind) {
    case "STAGE_MOUNTED":
      bumpAccumulation("stageMountCount");
      break;
    case "STAGE_UNMOUNTED":
      bumpAccumulation("stageUnmountCount");
      break;
    case "PRESENTATION_LATCH_ACQUIRED":
      bumpAccumulation("latchAcquireCount");
      break;
    case "PRESENTATION_LATCH_RELEASED":
      bumpAccumulation("latchReleaseCount");
      break;
    case "TRANSACTION_CLEANUP_STARTED":
      bumpAccumulation("cleanupStartedCount");
      break;
    case "TRANSACTION_CLEANUP_COMPLETED":
      bumpAccumulation("cleanupCompletedCount");
      break;
    case "TRANSITION_BEGIN":
      bumpAccumulation("transitionBeginCount");
      break;
    case "ABORTED":
      bumpAccumulation("abortedCount");
      break;
    case "SETTLED":
      bumpAccumulation("settledCount");
      break;
    default:
      break;
  }
}

export function exportPersistedMainTabShuffleTraceRing(): MainTabShuffleDiagTraceEvent[] {
  return readRing();
}

export function exportMainTabShuffleAccumulationCounters(): HopAccumulationCounters {
  return readAccumulation();
}

export function resetMainTabShuffleTraceDiag() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TRACE_RING_SESSION_KEY);
    window.sessionStorage.removeItem(TRACE_RING_META_SESSION_KEY);
    window.sessionStorage.removeItem(ACCUMULATION_SESSION_KEY);
  } catch {
    /* ignore */
  }
  memoryTraceRingIdentity = null;
  memoryOnlyRing = [];
}

if (typeof window !== "undefined") {
  installMainTabShuffleTraceArchiveHooks();
}

export function mergeMainTabShuffleTraceRings(
  memoryRing: MainTabShuffleDiagTraceEvent[],
): MainTabShuffleDiagTraceEvent[] {
  if (!isMainTabShuffleTraceDiagEnabled()) return memoryRing.slice();
  const persisted = readRing();
  const byKey = new Map<string, MainTabShuffleDiagTraceEvent>();
  for (const entry of [...persisted, ...memoryRing]) {
    byKey.set(`${entry.monoMs}|${entry.kind}|${entry.navSeq}`, entry);
  }
  return [...byKey.values()].sort((a, b) => a.monoMs - b.monoMs);
}

export function filterTraceForNavSeq(
  ring: MainTabShuffleDiagTraceEvent[],
  navSeq: number,
): MainTabShuffleDiagTraceEvent[] {
  if (!navSeq) return ring.slice();
  return ring.filter((entry) => entry.navSeq === navSeq);
}
