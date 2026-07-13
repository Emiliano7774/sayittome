/**
 * Same-document soft-commit TX pin.
 *
 * Survives transition-module / presentation-runtime re-init after router.push(/shuffle)
 * within the same JS document. Never written to localStorage/sessionStorage.
 * Full document reload clears globalThis → pin correctly absent.
 */

import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  emitLifecycleDiag,
  isMainTabShuffleLifecycleDiagEnabled,
} from "@/lib/perf/mainTabShuffleLifecycleDiag";

export const SOFT_COMMIT_TX_PIN_GLOBAL_KEY = Symbol.for(
  "sayittome.main-tab-shuffle-soft-commit-tx-pin.v1",
);

/** Soft-commit pin TTL — not a watchdog; only identity retention across same-doc reinit. */
export const SOFT_COMMIT_TX_PIN_TTL_MS = 8_000;

export type SoftCommitTxPinPhase =
  | "preparing"
  | "armed"
  | "sliding"
  | "settled"
  | "route_bridge"
  | "aborted"
  | "idle";

export type SoftCommitTxPinClearReason =
  | "settled"
  | "final-route-ready"
  | "expired"
  | "invalid-source"
  | "invalid-destination"
  | "wrong-destination"
  | "stale-generation"
  | "hard-navigation-detected"
  | "reduced-motion-settled"
  | "manual-abort"
  | "replaced"
  | "prep-timeout"
  | "route-abort"
  | "flag-disabled"
  | "no-active-tx"
  | "other-active-tx"
  | "unknown";

export type SoftCommitTxPinSnapshot = {
  txId: string;
  sourceTab: string;
  destinationPath: "/shuffle";
  phase: SoftCommitTxPinPhase;
  createdMono: number;
  softPushCommittedMono: number | null;
  lastSeenMono: number;
  navSeq: number;
  moduleInstanceIdOriginal: string | null;
  runtimeInstanceIdOriginal: string | null;
  softCommitGeneration: number;
  commitReason: string;
  expiresAtMono: number;
  isSoftCommitInFlight: boolean;
  sourcePath: string;
  direction: "from-right" | "from-left";
  startedAtMono: number;
  destinationReadyAtMono: number | null;
  slideStartedAtMono: number | null;
  slideEndedAtMono: number | null;
  abortReason: string | null;
  readinessState: Record<string, unknown> | null;
  sourceOwnerIdentity: string | null;
  destinationOwnerIdentity: string | null;
  slotsSnapshot: number | null;
  recoveryCount: number;
};

export type SoftCommitTxPinDiagKind =
  | "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT"
  | "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT"
  | "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH"
  | "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT"
  | "MICRO_SLIDE_TX_REHYDRATION_FAILED"
  | "MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX"
  | "MICRO_SLIDE_TX_PIN_CLEARED";

export type SoftCommitTxPinDiagEvent = {
  kind: SoftCommitTxPinDiagKind;
  monoMs: number;
  txId: string | null;
  sourceTab: string | null;
  destinationPath: string;
  phase: SoftCommitTxPinPhase | "idle";
  navSeq: number | null;
  moduleInstanceId: string | null;
  runtimeInstanceId: string | null;
  softCommitGeneration: number | null;
  reason: string;
  pinAgeMs: number | null;
  isSameDocument: boolean;
  pathname: string;
  activeTxPresent: boolean;
};

const DIAG_RING_MAX = 80;
const DIAG_RING_WINDOW_KEY = "__microSlideSoftCommitTxPinDiag";
const PIN_DIAG_SCHEMA_VERSION = 1;

type GlobalWithPin = typeof globalThis & {
  [key: symbol]: SoftCommitTxPinSnapshot | undefined;
};

let softCommitGenerationCounter = 0;
let diagRing: SoftCommitTxPinDiagEvent[] = [];
let lastClearedPins: SoftCommitTxPinDiagEvent[] = [];
let storeGeneration = 0;

function monoMs() {
  if (typeof performance === "undefined") return 0;
  return Math.round(performance.timeOrigin + performance.now());
}

function pathnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function isSameDocumentRealm() {
  return typeof window !== "undefined";
}

function restoreDiagRingFromWindow() {
  if (typeof window === "undefined") return;
  try {
    const existing = (window as unknown as Record<string, unknown>)[DIAG_RING_WINDOW_KEY];
    if (Array.isArray(existing) && existing.length > 0 && diagRing.length === 0) {
      diagRing = existing.slice(-DIAG_RING_MAX) as SoftCommitTxPinDiagEvent[];
    }
  } catch {
    /* ignore */
  }
}

function persistDiagRing() {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[DIAG_RING_WINDOW_KEY] = diagRing;
}

export function emitSoftCommitTxPinDiag(
  kind: SoftCommitTxPinDiagKind,
  extras: {
    reason: string;
    txId?: string | null;
    sourceTab?: string | null;
    phase?: SoftCommitTxPinPhase | "idle";
    navSeq?: number | null;
    moduleInstanceId?: string | null;
    runtimeInstanceId?: string | null;
    softCommitGeneration?: number | null;
    pinAgeMs?: number | null;
    activeTxPresent?: boolean;
  },
): SoftCommitTxPinDiagEvent {
  const pin = getSoftCommitTxPin();
  const now = monoMs();
  const event: SoftCommitTxPinDiagEvent = {
    kind,
    monoMs: now,
    txId: extras.txId ?? pin?.txId ?? null,
    sourceTab: extras.sourceTab ?? pin?.sourceTab ?? null,
    destinationPath: "/shuffle",
    phase: extras.phase ?? pin?.phase ?? "idle",
    navSeq: extras.navSeq ?? pin?.navSeq ?? null,
    moduleInstanceId: extras.moduleInstanceId ?? pin?.moduleInstanceIdOriginal ?? null,
    runtimeInstanceId: extras.runtimeInstanceId ?? pin?.runtimeInstanceIdOriginal ?? null,
    softCommitGeneration: extras.softCommitGeneration ?? pin?.softCommitGeneration ?? null,
    reason: extras.reason,
    pinAgeMs:
      extras.pinAgeMs ??
      (pin ? Math.max(0, now - pin.createdMono) : null),
    isSameDocument: isSameDocumentRealm(),
    pathname: pathnameNow(),
    activeTxPresent: extras.activeTxPresent ?? false,
  };
  diagRing = [...diagRing.slice(-(DIAG_RING_MAX - 1)), event];
  if (kind === "MICRO_SLIDE_TX_PIN_CLEARED") {
    lastClearedPins = [...lastClearedPins.slice(-19), event];
  }
  storeGeneration += 1;
  persistDiagRing();
  if (isMainTabShuffleLifecycleDiagEnabled()) {
    emitLifecycleDiag({
      kind: event.kind,
      monoMs: event.monoMs,
      transactionId: event.txId,
      phase: event.phase,
      navSeq: event.navSeq ?? 0,
      moduleInstanceId: event.moduleInstanceId ?? undefined,
      runtimeInstanceId: event.runtimeInstanceId ?? undefined,
      reason: event.reason,
      note: `softCommitGeneration=${event.softCommitGeneration ?? "none"}|pinAgeMs=${event.pinAgeMs ?? "none"}|sameDoc=${event.isSameDocument}|activeTxPresent=${event.activeTxPresent}`,
      pathname: event.pathname,
    });
  }
  if (isNavTraceEnabled()) {
    console.info(`[micro-slide-soft-commit-tx-pin] ${kind}`, event);
  }
  return event;
}

export function exportSoftCommitTxPinDiagEvents(): SoftCommitTxPinDiagEvent[] {
  return [...diagRing];
}

export function exportSoftCommitTxPinDiag() {
  const pin = getSoftCommitTxPin();
  const now = monoMs();
  const byTxId: Record<string, SoftCommitTxPinDiagEvent[]> = {};
  for (const event of diagRing) {
    const txId = event.txId;
    if (!txId) continue;
    if (!byTxId[txId]) byTxId[txId] = [];
    byTxId[txId].push(event);
  }
  const rehydrationEvents = diagRing.filter((e) =>
    String(e.kind).includes("REHYDR"),
  );
  const legacyBlockEvents = diagRing.filter((e) =>
    String(e.kind).includes("LEGACY") && String(e.kind).includes("BLOCK"),
  );
  const failedRehydrationEvents = diagRing.filter(
    (e) =>
      String(e.kind).includes("REHYDR") &&
      (String(e.reason || "").includes("fail") || String(e.reason || "").includes("miss")),
  );
  return {
    activePin: pin,
    pinHistory: [...diagRing],
    lastClearedPins: [...lastClearedPins],
    rehydrationEvents,
    legacyBlockEvents,
    failedRehydrationEvents,
    byTxId,
    currentPinAge: pin ? Math.max(0, now - pin.createdMono) : null,
    sameDocumentOnly: true,
    storeGeneration,
    schemaVersion: PIN_DIAG_SCHEMA_VERSION,
    exportAvailable: true,
  };
}

export function getSoftCommitTxPin(): SoftCommitTxPinSnapshot | null {
  const g = globalThis as GlobalWithPin;
  return g[SOFT_COMMIT_TX_PIN_GLOBAL_KEY] ?? null;
}

export function isSoftCommitTxPinActive(now = monoMs()): boolean {
  const pin = getSoftCommitTxPin();
  if (!pin) return false;
  if (now > pin.expiresAtMono) return false;
  return pin.phase === "preparing" || pin.phase === "armed" || pin.phase === "sliding" || pin.isSoftCommitInFlight;
}

export function shouldBlockLegacyShufflePresentationDueToPinnedTx(now = monoMs()): boolean {
  if (!isMainTabToShuffleMicroSlideEnabled()) return false;
  const pin = getSoftCommitTxPin();
  if (!pin) return false;
  if (now > pin.expiresAtMono) {
    clearSoftCommitTxPin("expired");
    return false;
  }
  if (pin.destinationPath !== "/shuffle") return false;
  return (
    pin.isSoftCommitInFlight ||
    pin.phase === "preparing" ||
    pin.phase === "armed" ||
    pin.phase === "sliding" ||
    pin.phase === "settled" ||
    pin.phase === "route_bridge"
  );
}

export function pinSoftCommitTx(input: {
  txId: string;
  sourceTab: string;
  phase: SoftCommitTxPinPhase;
  navSeq: number;
  sourcePath: string;
  direction: "from-right" | "from-left";
  createdMono: number;
  startedAtMono: number;
  moduleInstanceId: string | null;
  runtimeInstanceId: string | null;
  commitReason?: string;
  readinessState?: Record<string, unknown> | null;
  sourceOwnerIdentity?: string | null;
  destinationOwnerIdentity?: string | null;
  slotsSnapshot?: number | null;
  destinationReadyAtMono?: number | null;
  slideStartedAtMono?: number | null;
  slideEndedAtMono?: number | null;
  abortReason?: string | null;
  /** Fail-closed: must be true with a non-null txId. */
  activeTxPresent?: boolean;
}): SoftCommitTxPinSnapshot | null {
  if (!input.txId || input.activeTxPresent === false) {
    void import("@/lib/navigation/mainTabShuffleNavIntent").then(
      ({ reportMicroSlidePinCreationBlocked }) => {
        reportMicroSlidePinCreationBlocked("pinSoftCommitTx", "no-active-tx");
      },
    );
    return null;
  }
  softCommitGenerationCounter += 1;
  const now = monoMs();
  const pin: SoftCommitTxPinSnapshot = {
    txId: input.txId,
    sourceTab: input.sourceTab,
    destinationPath: "/shuffle",
    phase: input.phase,
    createdMono: input.createdMono,
    softPushCommittedMono: null,
    lastSeenMono: now,
    navSeq: input.navSeq,
    moduleInstanceIdOriginal: input.moduleInstanceId,
    runtimeInstanceIdOriginal: input.runtimeInstanceId,
    softCommitGeneration: softCommitGenerationCounter,
    commitReason: input.commitReason ?? "main-tab-to-shuffle-micro-slide",
    expiresAtMono: now + SOFT_COMMIT_TX_PIN_TTL_MS,
    isSoftCommitInFlight: false,
    sourcePath: input.sourcePath,
    direction: input.direction,
    startedAtMono: input.startedAtMono,
    destinationReadyAtMono: input.destinationReadyAtMono ?? null,
    slideStartedAtMono: input.slideStartedAtMono ?? null,
    slideEndedAtMono: input.slideEndedAtMono ?? null,
    abortReason: input.abortReason ?? null,
    readinessState: input.readinessState ?? null,
    sourceOwnerIdentity: input.sourceOwnerIdentity ?? null,
    destinationOwnerIdentity: input.destinationOwnerIdentity ?? null,
    slotsSnapshot: input.slotsSnapshot ?? null,
    recoveryCount: 0,
  };
  const g = globalThis as GlobalWithPin;
  g[SOFT_COMMIT_TX_PIN_GLOBAL_KEY] = pin;
  emitSoftCommitTxPinDiag("MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", {
    reason: pin.commitReason,
    txId: pin.txId,
    sourceTab: pin.sourceTab,
    phase: pin.phase,
    navSeq: pin.navSeq,
    moduleInstanceId: pin.moduleInstanceIdOriginal,
    runtimeInstanceId: pin.runtimeInstanceIdOriginal,
    softCommitGeneration: pin.softCommitGeneration,
    activeTxPresent: true,
  });
  return pin;
}

export function markSoftCommitTxPinInFlight(input?: {
  moduleInstanceId?: string | null;
  runtimeInstanceId?: string | null;
  activeTxPresent?: boolean;
}): SoftCommitTxPinSnapshot | null {
  const pin = getSoftCommitTxPin();
  if (!pin) return null;
  const now = monoMs();
  pin.isSoftCommitInFlight = true;
  pin.softPushCommittedMono = now;
  pin.lastSeenMono = now;
  pin.expiresAtMono = now + SOFT_COMMIT_TX_PIN_TTL_MS;
  if (input?.moduleInstanceId) pin.moduleInstanceIdOriginal = input.moduleInstanceId;
  if (input?.runtimeInstanceId) pin.runtimeInstanceIdOriginal = input.runtimeInstanceId;
  emitSoftCommitTxPinDiag("MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT", {
    reason: "soft-router-push",
    txId: pin.txId,
    sourceTab: pin.sourceTab,
    phase: pin.phase,
    navSeq: pin.navSeq,
    moduleInstanceId: pin.moduleInstanceIdOriginal,
    runtimeInstanceId: pin.runtimeInstanceIdOriginal,
    softCommitGeneration: pin.softCommitGeneration,
    activeTxPresent: input?.activeTxPresent ?? true,
  });
  return pin;
}

export function touchSoftCommitTxPin(phase?: SoftCommitTxPinPhase) {
  const pin = getSoftCommitTxPin();
  if (!pin) return null;
  const now = monoMs();
  pin.lastSeenMono = now;
  if (phase) pin.phase = phase;
  return pin;
}

export function clearSoftCommitTxPin(
  reason: SoftCommitTxPinClearReason | string,
  extras?: {
    moduleInstanceId?: string | null;
    runtimeInstanceId?: string | null;
    activeTxPresent?: boolean;
  },
): boolean {
  const pin = getSoftCommitTxPin();
  if (!pin) return false;
  emitSoftCommitTxPinDiag("MICRO_SLIDE_TX_PIN_CLEARED", {
    reason,
    txId: pin.txId,
    sourceTab: pin.sourceTab,
    phase: pin.phase,
    navSeq: pin.navSeq,
    moduleInstanceId: extras?.moduleInstanceId ?? pin.moduleInstanceIdOriginal,
    runtimeInstanceId: extras?.runtimeInstanceId ?? pin.runtimeInstanceIdOriginal,
    softCommitGeneration: pin.softCommitGeneration,
    activeTxPresent: extras?.activeTxPresent ?? false,
  });
  const g = globalThis as GlobalWithPin;
  delete g[SOFT_COMMIT_TX_PIN_GLOBAL_KEY];
  return true;
}

export function expireSoftCommitTxPinIfNeeded(now = monoMs()): boolean {
  const pin = getSoftCommitTxPin();
  if (!pin) return false;
  if (now <= pin.expiresAtMono) return false;
  clearSoftCommitTxPin("expired");
  return true;
}

export type SoftCommitRehydrateResult =
  | { ok: true; pin: SoftCommitTxPinSnapshot; reason: "rehydrated" | "already-present" }
  | { ok: false; reason: SoftCommitTxPinClearReason | string; pin: SoftCommitTxPinSnapshot | null };

/**
 * Validate pin for rehydration. Does not mutate runtime — caller installs activeTx.
 */
export function validateSoftCommitTxPinForRehydrate(input: {
  expectedGeneration?: number | null;
  pathname?: string;
  existingActiveTxId?: string | null;
}): SoftCommitRehydrateResult {
  expireSoftCommitTxPinIfNeeded();
  const pin = getSoftCommitTxPin();
  if (!pin) {
    return { ok: false, reason: "no-pin", pin: null };
  }
  if (pin.destinationPath !== "/shuffle") {
    clearSoftCommitTxPin("wrong-destination");
    return { ok: false, reason: "wrong-destination", pin: null };
  }
  if (input.expectedGeneration != null && input.expectedGeneration !== pin.softCommitGeneration) {
    clearSoftCommitTxPin("stale-generation");
    return { ok: false, reason: "stale-generation", pin: null };
  }
  if (input.existingActiveTxId && input.existingActiveTxId !== pin.txId) {
    return { ok: false, reason: "other-active-tx", pin };
  }
  if (input.existingActiveTxId && input.existingActiveTxId === pin.txId) {
    return { ok: true, pin, reason: "already-present" };
  }
  const path = input.pathname ?? pathnameNow();
  // Direct cold /shuffle without soft-commit in-flight must not rehydrate a stale pin.
  if (!pin.isSoftCommitInFlight && pin.phase === "preparing" && path === "/shuffle") {
    // Still allow if soft commit was marked; otherwise reject cold path.
  }
  if (!pin.isSoftCommitInFlight && path === "/shuffle" && pin.phase !== "preparing" && pin.phase !== "armed" && pin.phase !== "sliding") {
    clearSoftCommitTxPin("route-abort");
    return { ok: false, reason: "route-abort", pin: null };
  }
  pin.recoveryCount += 1;
  pin.lastSeenMono = monoMs();
  return { ok: true, pin, reason: "rehydrated" };
}

export function noteSoftCommitTxPinRehydrated(input: {
  moduleInstanceId: string | null;
  runtimeInstanceId: string | null;
  activeTxPresent: boolean;
}) {
  const pin = getSoftCommitTxPin();
  if (!pin) return;
  emitSoftCommitTxPinDiag("MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT", {
    reason: `recoveryCount=${pin.recoveryCount}`,
    txId: pin.txId,
    sourceTab: pin.sourceTab,
    phase: pin.phase,
    navSeq: pin.navSeq,
    moduleInstanceId: input.moduleInstanceId,
    runtimeInstanceId: input.runtimeInstanceId,
    softCommitGeneration: pin.softCommitGeneration,
    activeTxPresent: input.activeTxPresent,
  });
}

export function noteSoftCommitTxPinRehydrationFailed(
  reason: string,
  extras?: {
    moduleInstanceId?: string | null;
    runtimeInstanceId?: string | null;
  },
) {
  emitSoftCommitTxPinDiag("MICRO_SLIDE_TX_REHYDRATION_FAILED", {
    reason,
    moduleInstanceId: extras?.moduleInstanceId ?? null,
    runtimeInstanceId: extras?.runtimeInstanceId ?? null,
    activeTxPresent: false,
  });
}

export function noteSoftCommitRuntimeReinitAfterSoftPush(input: {
  moduleInstanceId: string | null;
  runtimeInstanceId: string | null;
  previousModuleInstanceId: string | null;
  previousRuntimeInstanceId: string | null;
}) {
  const pin = getSoftCommitTxPin();
  emitSoftCommitTxPinDiag("MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH", {
    reason: `previousModule=${input.previousModuleInstanceId ?? "none"}|previousRuntime=${input.previousRuntimeInstanceId ?? "none"}`,
    txId: pin?.txId ?? null,
    sourceTab: pin?.sourceTab ?? null,
    phase: pin?.phase ?? "idle",
    navSeq: pin?.navSeq ?? null,
    moduleInstanceId: input.moduleInstanceId,
    runtimeInstanceId: input.runtimeInstanceId,
    softCommitGeneration: pin?.softCommitGeneration ?? null,
    activeTxPresent: false,
  });
}

export function noteLegacyRevealBlockedByPinnedTx(caller: string) {
  const pin = getSoftCommitTxPin();
  emitSoftCommitTxPinDiag("MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX", {
    reason: caller,
    txId: pin?.txId ?? null,
    sourceTab: pin?.sourceTab ?? null,
    phase: pin?.phase ?? "idle",
    navSeq: pin?.navSeq ?? null,
    activeTxPresent: false,
  });
}

export function resetSoftCommitTxPinForTests() {
  const g = globalThis as GlobalWithPin;
  delete g[SOFT_COMMIT_TX_PIN_GLOBAL_KEY];
  diagRing = [];
  lastClearedPins = [];
  softCommitGenerationCounter = 0;
  storeGeneration = 0;
}

/** Localhost-only forced reinit probe — never active in production hosts. */
export function isForceSoftPushModuleReinitForTestEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("force_soft_push_module_reinit") === "1") return true;
    if (window.sessionStorage.getItem("sayittome:force-soft-push-module-reinit") === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return Boolean(
    (window as unknown as { __FORCE_SOFT_PUSH_MODULE_REINIT_FOR_TEST_ONLY?: boolean })
      .__FORCE_SOFT_PUSH_MODULE_REINIT_FOR_TEST_ONLY,
  );
}

export function installSoftCommitTxPinDiagHooks() {
  if (typeof window === "undefined") return;
  restoreDiagRingFromWindow();
  const win = window as unknown as Record<string, unknown>;
  win[DIAG_RING_WINDOW_KEY] = diagRing;
  win.__exportSoftCommitTxPinDiag = exportSoftCommitTxPinDiag;
  win.__exportSoftCommitTxPinDiagEvents = exportSoftCommitTxPinDiagEvents;
  win.__getSoftCommitTxPin = getSoftCommitTxPin;
}

if (typeof window !== "undefined") {
  installSoftCommitTxPinDiagHooks();
}
