/**
 * Inert activation diagnostics — only active with ?navcapture=1.
 * Dry-run (?microSlideDryRun=1) records lifecycle intent without visual output.
 */

import { BUILD_SHA, MICRO_SLIDE_IMPL_VERSION } from "@/lib/perf/buildMarker";
import { pathToMainTabShuffleSource } from "@/lib/navigation/mainTabToShuffleTransition";
import { getShuffleDestinationReadiness } from "@/lib/navigation/shuffleDestinationReadiness";
import {
  getMicroSlideBuildDefault,
  getMicroSlideLocalStorageOverride,
  isMainTabToShuffleMicroSlideEnabled,
  isMicroSlideLocalOverrideHost,
} from "@/lib/perf/instantaneityFlags";
import { isNavCaptureEnabled } from "@/lib/perf/navCaptureDiag";

export type MicroSlideSkipReason =
  | "FLAG_FALSE"
  | "NO_SOURCE"
  | "INTEGRATION_NOT_INSTALLED"
  | "BLOCKED_DURING_SLIDE"
  | "NONE";

export type MicroSlideActivationEvent = {
  monoMs: number;
  kind: string;
  source?: string | null;
  bottomNavImplementation?: string | null;
  effectiveFlag?: boolean;
  buildFlag?: boolean;
  skipReason?: MicroSlideSkipReason;
  detail?: string;
  navSeq?: number;
};

type DryRunPhase = "idle" | "preparing" | "committed" | "settled";

type DryRunTransaction = {
  navSeq: number;
  source: string;
  phase: DryRunPhase;
  pointerdownMonoMs: number;
  fromPath: string;
};

type DryRunState = {
  navSeqCounter: number;
  active: DryRunTransaction | null;
};

const EVENT_RING_MAX = 160;
const EVENT_RING_KEY = "__microSlideActivationEventRing";
const DRY_RUN_STATE_KEY = "__microSlideDryRunState";
const DRY_RUN_SESSION_KEY = "sayittome:micro-slide-dry-run-session";
const NAV_CAPTURE_SESSION_KEY = "sayittome:nav-capture-session";
const GESTURE_DEDUPE_MS = 80;

function readEventRing(): MicroSlideActivationEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const fromSession = window.sessionStorage.getItem(EVENT_RING_KEY);
    if (fromSession) {
      const parsed = JSON.parse(fromSession) as MicroSlideActivationEvent[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  const stored = (window as unknown as Record<string, unknown>)[EVENT_RING_KEY];
  return Array.isArray(stored) ? (stored as MicroSlideActivationEvent[]) : [];
}

function readDryRunState(): DryRunState {
  if (typeof window === "undefined") {
    return { navSeqCounter: 0, active: null };
  }
  try {
    const fromSession = window.sessionStorage.getItem(DRY_RUN_STATE_KEY);
    if (fromSession) {
      const parsed = JSON.parse(fromSession) as DryRunState;
      if (parsed && typeof parsed === "object") {
        return {
          navSeqCounter: typeof parsed.navSeqCounter === "number" ? parsed.navSeqCounter : 0,
          active: parsed.active ?? null,
        };
      }
    }
  } catch {
    /* ignore */
  }
  const stored = (window as unknown as Record<string, unknown>)[DRY_RUN_STATE_KEY];
  if (stored && typeof stored === "object") {
    const state = stored as DryRunState;
    return {
      navSeqCounter: typeof state.navSeqCounter === "number" ? state.navSeqCounter : 0,
      active: state.active ?? null,
    };
  }
  return { navSeqCounter: 0, active: null };
}

function writeDryRunState(state: DryRunState) {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[DRY_RUN_STATE_KEY] = state;
  try {
    window.sessionStorage.setItem(DRY_RUN_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let eventRing: MicroSlideActivationEvent[] = readEventRing();
let dryRunState: DryRunState = readDryRunState();

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function persistNavCaptureSession() {
  if (typeof window === "undefined") return;
  if (!isNavCaptureEnabled()) return;
  try {
    window.sessionStorage.setItem(NAV_CAPTURE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function probeActive() {
  if (typeof window === "undefined") return false;
  if (isNavCaptureEnabled()) {
    persistNavCaptureSession();
    return true;
  }
  try {
    return window.sessionStorage.getItem(NAV_CAPTURE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDryRunSession() {
  if (typeof window === "undefined") return;
  if (
    window.location.search.includes("microSlideDryRun=1") ||
    window.localStorage.getItem("sayittome:micro-slide-dry-run") === "1"
  ) {
    try {
      window.sessionStorage.setItem(DRY_RUN_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }
}

export function isMicroSlideDryRunEnabled() {
  if (!probeActive()) return false;
  persistDryRunSession();
  if (window.location.search.includes("microSlideDryRun=1")) return true;
  if (window.localStorage.getItem("sayittome:micro-slide-dry-run") === "1") return true;
  try {
    return window.sessionStorage.getItem(DRY_RUN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function syncDryRunState() {
  dryRunState = readDryRunState();
}

function syncEventRing() {
  eventRing = readEventRing();
}

function pushEvent(kind: string, extras?: Partial<MicroSlideActivationEvent>) {
  if (!probeActive()) return;
  eventRing = [
    ...eventRing.slice(-EVENT_RING_MAX + 1),
    { kind, monoMs: monoMs(), ...extras },
  ];
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>)[EVENT_RING_KEY] = eventRing;
    try {
      window.sessionStorage.setItem(EVENT_RING_KEY, JSON.stringify(eventRing));
    } catch {
      /* ignore */
    }
  }
}

function abortActiveDryRun(reason: string) {
  syncDryRunState();
  const active = dryRunState.active;
  if (!active) return;
  pushEvent("DRY_RUN_ABORTED", {
    source: active.source,
    navSeq: active.navSeq,
    detail: `reason=${reason}|navSeq=${active.navSeq}|phase=${active.phase}`,
  });
  dryRunState = { ...dryRunState, active: null };
  writeDryRunState(dryRunState);
}

function settleDryRun(navSeq: number, source: string) {
  pushEvent("DRY_RUN_SETTLED", {
    source,
    navSeq,
    detail: `navSeq=${navSeq}|state=idle`,
  });
  dryRunState = { ...dryRunState, active: null };
  writeDryRunState(dryRunState);
}

export function resetMicroSlideActivationDryRun(options?: { clearEvents?: boolean }) {
  if (typeof window === "undefined") return;
  syncDryRunState();
  if (dryRunState.active) {
    abortActiveDryRun("reset-between-hops");
  }
  dryRunState = { navSeqCounter: dryRunState.navSeqCounter, active: null };
  writeDryRunState(dryRunState);
  if (options?.clearEvents) {
    eventRing = [];
    (window as unknown as Record<string, unknown>)[EVENT_RING_KEY] = eventRing;
    try {
      window.sessionStorage.removeItem(EVENT_RING_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function traceDryRunIntegration(
  step:
    | "POINTERDOWN"
    | "POINTERUP"
    | "CLICK"
    | "PREPARE_MAIN_TAB_TO_SHUFFLE"
    | "COMPLETE_WARM_SHUFFLE"
    | "ROUTER_PUSH_SHUFFLE",
  detail?: string,
) {
  if (!probeActive() || !isMicroSlideDryRunEnabled()) return;
  syncDryRunState();
  const active = dryRunState.active;
  pushEvent(`DRY_RUN_INTEGRATION_${step}`, {
    source: active?.source ?? null,
    navSeq: active?.navSeq,
    detail,
  });
}

export function detectBottomNavImplementation(): string | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector("[data-bottom-nav-implementation]");
  return el?.getAttribute("data-bottom-nav-implementation") ?? null;
}

export function isShuffleTabControlPresent(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(
      '.sayittome-bottom-nav [data-nav-tab="shuffle"], .sayittome-bottom-nav button[data-nav-tab="shuffle"]',
    ),
  );
}

export function exportMicroSlideActivationSnapshot() {
  syncEventRing();
  syncDryRunState();
  const override = getMicroSlideLocalStorageOverride();
  return {
    microSlideBuildFlag: getMicroSlideBuildDefault(),
    microSlideRuntimeEnabled: isMainTabToShuffleMicroSlideEnabled(),
    microSlideOverridePresent: override !== null,
    microSlideOverrideValue: override,
    microSlideOverrideHost: isMicroSlideLocalOverrideHost(),
    microSlideModuleLoaded: true,
    microSlideImplementationVersion: MICRO_SLIDE_IMPL_VERSION,
    buildSha: BUILD_SHA,
    bottomNavImplementation: detectBottomNavImplementation(),
    shuffleTabControlFound: isShuffleTabControlPresent(),
    pointerIntegrationInstalled: true,
    microSlideDryRunEnabled: isMicroSlideDryRunEnabled(),
    dryRunActiveTransaction: dryRunState.active,
    dryRunNavSeqCounter: dryRunState.navSeqCounter,
    events: [...eventRing],
  };
}

function resolveSkipReason(fromPath: string, blockedDuringSlide: boolean): MicroSlideSkipReason {
  if (blockedDuringSlide) return "BLOCKED_DURING_SLIDE";
  if (!isMainTabToShuffleMicroSlideEnabled()) return "FLAG_FALSE";
  if (!pathToMainTabShuffleSource(fromPath)) return "NO_SOURCE";
  return "NONE";
}

let dryRunClickDisarm: (() => void) | null = null;

function disarmDryRunClickCommit() {
  dryRunClickDisarm?.();
  dryRunClickDisarm = null;
}

function getDryRunShuffleDestinationReadiness() {
  const base = getShuffleDestinationReadiness();
  if (base.ready) return base;
  if (typeof document === "undefined" || typeof window === "undefined") return base;

  const path = window.location.pathname.split("?")[0].split("#")[0];
  if (path !== "/shuffle") return base;

  const feed =
    document.querySelector("#sayittome-shuffle-keepalive-host [data-shuffle-list]") ??
    document.querySelector("[data-shuffle-list]");
  if (!feed) return base;

  const slots = [...feed.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")];
  if (slots.length < 3) {
    return {
      ...base,
      reason: base.reason ?? "domSlots<3",
      domSlots: slots.length,
    };
  }

  return {
    ...base,
    ready: true,
    reason: undefined,
    domSlots: slots.length,
    loadingShellCount: 0,
  };
}

function startDryRunReadinessLoop(navSeq: number, source: string) {
  let readinessFrames = 0;
  const readinessDeadline = monoMs() + 8000;
  let loopId = 0;

  const pollDryRunReadiness = () => {
    syncDryRunState();
    const active = dryRunState.active;
    if (!active || active.navSeq !== navSeq || active.phase !== "committed") {
      return;
    }

    readinessFrames += 1;
    const readiness = getDryRunShuffleDestinationReadiness();
    if (readinessFrames === 1 || readiness.ready || readinessFrames % 30 === 0) {
      pushEvent("READINESS_DRY_RUN_SAMPLE", {
        source,
        navSeq,
        detail: JSON.stringify({
          ready: readiness.ready,
          reason: readiness.reason,
          domSlots: readiness.sample?.domSlots ?? readiness.domSlots,
          loadingShellCount: readiness.loadingShellCount,
          frame: readinessFrames,
          pathname:
            typeof window !== "undefined"
              ? window.location.pathname.split("?")[0].split("#")[0]
              : null,
        }),
      });
    }

    if (readiness.ready) {
      pushEvent("DESTINATION_READY_DRY_RUN", {
        source,
        navSeq,
        detail: `navSeq=${navSeq}|frames=${readinessFrames}`,
      });
      settleDryRun(navSeq, source);
      return;
    }

    if (readinessFrames >= 360 || monoMs() >= readinessDeadline) {
      pushEvent("DRY_RUN_ABORTED", {
        source,
        navSeq,
        detail: `reason=READINESS_TIMEOUT|last=${readiness.reason ?? "unknown"}|frames=${readinessFrames}`,
      });
      dryRunState = { ...dryRunState, active: null };
      writeDryRunState(dryRunState);
      return;
    }

    loopId = requestAnimationFrame(pollDryRunReadiness);
  };

  requestAnimationFrame(pollDryRunReadiness);
}

export function resumePendingDryRunReadinessLoop() {
  if (!probeActive() || !isMicroSlideDryRunEnabled()) return false;
  syncEventRing();
  syncDryRunState();
  const active = dryRunState.active;
  if (!active || active.phase !== "committed") return false;
  const hasReady = eventRing.some(
    (event) => event.kind === "DESTINATION_READY_DRY_RUN" && event.navSeq === active.navSeq,
  );
  if (hasReady) {
    settleDryRun(active.navSeq, active.source);
    return true;
  }
  startDryRunReadinessLoop(active.navSeq, active.source);
  return true;
}
function armDryRunClickCommit(fromPath: string, navSeq: number) {
  if (!isMicroSlideDryRunEnabled()) return;
  if (typeof document === "undefined") return;

  disarmDryRunClickCommit();
  const selector = '.sayittome-bottom-nav [data-nav-tab="shuffle"]';
  const onCaptureClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(selector)) return;
    disarmDryRunClickCommit();
    pushEvent("DRY_RUN_INTEGRATION_POINTERUP_CLICK_CAPTURED", {
      source: pathToMainTabShuffleSource(fromPath),
      navSeq,
      detail: `navSeq=${navSeq}|fromPath=${fromPath}`,
    });
    observeShuffleNavClickCommit(fromPath);
  };
  document.addEventListener("click", onCaptureClick, true);
  dryRunClickDisarm = () => document.removeEventListener("click", onCaptureClick, true);
}

function beginDryRunTransaction(fromPath: string, source: string) {
  syncDryRunState();
  const now = monoMs();
  const active = dryRunState.active;

  if (
    active &&
    active.phase === "committed"
  ) {
    return active.navSeq;
  }

  if (
    active &&
    active.phase === "preparing" &&
    active.source === source &&
    now - active.pointerdownMonoMs <= GESTURE_DEDUPE_MS
  ) {
    pushEvent("ONE_GESTURE_ONE_NAVSEQ", {
      source,
      navSeq: active.navSeq,
      detail: `navSeq=${active.navSeq}|deduped=pointerenter-pointerdown`,
    });
    return active.navSeq;
  }

  if (active) {
    abortActiveDryRun("superseded-by-new-pointerdown");
  }

  const navSeq = dryRunState.navSeqCounter + 1;
  dryRunState = {
    navSeqCounter: navSeq,
    active: {
      navSeq,
      source,
      phase: "preparing",
      pointerdownMonoMs: now,
      fromPath,
    },
  };
  writeDryRunState(dryRunState);

  pushEvent("ONE_GESTURE_ONE_NAVSEQ", {
    source,
    navSeq,
    detail: `navSeq=${navSeq}|phase=preparing`,
  });
  pushEvent("TRANSITION_DRY_RUN_BEGIN", {
    source,
    navSeq,
    detail: `navSeq=${navSeq}|fromPath=${fromPath}`,
  });
  pushEvent("NAVIGATION_COMMIT_DRY_RUN_PENDING", {
    source,
    navSeq,
    detail: `navSeq=${navSeq}|awaitingClick=true`,
  });
  armDryRunClickCommit(fromPath, navSeq);
  return navSeq;
}

/** Called from warmShuffleTabNavigation on pointerdown — inert observation. */
export function observeShuffleNavPointerdown(fromPath: string, blockedDuringSlide = false) {
  if (!probeActive()) return;

  const source = pathToMainTabShuffleSource(fromPath);
  const effectiveFlag = isMainTabToShuffleMicroSlideEnabled();
  const skipReason = resolveSkipReason(fromPath, blockedDuringSlide);
  const bottomNavImplementation = detectBottomNavImplementation();
  const routeAtPointerdown =
    typeof window !== "undefined" ? window.location.pathname.split("?")[0].split("#")[0] : fromPath;

  pushEvent("SHUFFLE_NAV_POINTERDOWN_OBSERVED", {
    source,
    bottomNavImplementation,
    effectiveFlag,
    buildFlag: getMicroSlideBuildDefault(),
    skipReason,
    detail: `fromPath=${fromPath}|routeAtPointerdown=${routeAtPointerdown}`,
  });

  if (skipReason !== "NONE") {
    pushEvent("MICRO_SLIDE_SKIPPED", {
      source,
      bottomNavImplementation,
      effectiveFlag,
      buildFlag: getMicroSlideBuildDefault(),
      skipReason,
      detail: `reason=${skipReason}`,
    });
    if (!isMicroSlideDryRunEnabled() || !source) return;
  }

  if (isMicroSlideDryRunEnabled() && source) {
    beginDryRunTransaction(fromPath, source);
  }
}

/** Called from warmShuffleTabNavigation on click commit — inert / dry-run only. */
export function observeShuffleNavClickCommit(fromPath: string) {
  if (!probeActive()) return;

  syncEventRing();
  const source = pathToMainTabShuffleSource(fromPath);
  syncDryRunState();
  const active = dryRunState.active;
  const resolvedSource =
    source ??
    (active?.source as ReturnType<typeof pathToMainTabShuffleSource>) ??
    null;
  const routeAtClick =
    typeof window !== "undefined" ? window.location.pathname.split("?")[0].split("#")[0] : fromPath;

  if (!isMicroSlideDryRunEnabled() || !resolvedSource) {
    if (isMicroSlideDryRunEnabled() && !resolvedSource) {
      pushEvent("DRY_RUN_ABORTED", {
        source: null,
        detail: `reason=NO_SOURCE_AT_COMMIT|fromPath=${fromPath}|routeAtClick=${routeAtClick}`,
      });
    }
    return;
  }

  const activeTx = dryRunState.active;

  if (activeTx?.phase === "committed") {
    return;
  }

  pushEvent("DRY_RUN_INTEGRATION_CLICK", {
    source: resolvedSource,
    navSeq: activeTx?.navSeq,
    detail: `fromPath=${fromPath}|routeAtClick=${routeAtClick}|activeNavSeq=${activeTx?.navSeq ?? "none"}|activePhase=${activeTx?.phase ?? "idle"}`,
  });

  if (!activeTx || activeTx.phase !== "preparing") {
    pushEvent("DRY_RUN_ABORTED", {
      source: resolvedSource,
      detail: `reason=${!activeTx ? "NO_ACTIVE_TRANSACTION" : "UNEXPECTED_PHASE"}|routeAtClick=${routeAtClick}|fromPath=${fromPath}`,
    });
    return;
  }

  if (activeTx.source !== resolvedSource) {
    pushEvent("DRY_RUN_ABORTED", {
      source: resolvedSource,
      navSeq: activeTx.navSeq,
      detail: `reason=SOURCE_MISMATCH|prepared=${activeTx.source}|click=${resolvedSource}`,
    });
    return;
  }

  const navSeq = activeTx.navSeq;
  disarmDryRunClickCommit();
  dryRunState = {
    ...dryRunState,
    active: { ...activeTx, phase: "committed" },
  };
  writeDryRunState(dryRunState);

  pushEvent("NAVIGATION_COMMIT_DRY_RUN", {
    source: resolvedSource,
    navSeq,
    detail: `navSeq=${navSeq}|preparedNavSeq=${navSeq}|committedNavSeq=${navSeq}`,
  });
  pushEvent("READINESS_LOOP_DRY_RUN_STARTED", {
    source: resolvedSource,
    navSeq,
    detail: `navSeq=${navSeq}`,
  });

  startDryRunReadinessLoop(navSeq, resolvedSource);
}

export function attachMicroSlideActivationProbe() {
  if (!probeActive()) return;
  if (typeof window === "undefined") return;
  const win = window as unknown as {
    __microSlideActivationExport?: () => unknown;
    __microSlideActivationResetDryRun?: (options?: { clearEvents?: boolean }) => void;
    __microSlideActivationResumeDryRunReadiness?: () => boolean;
    __microSlideActivationSimulateCommit?: (fromPath?: string) => void;
  };
  win.__microSlideActivationExport = exportMicroSlideActivationSnapshot;
  win.__microSlideActivationResetDryRun = resetMicroSlideActivationDryRun;
  win.__microSlideActivationResumeDryRunReadiness = resumePendingDryRunReadinessLoop;
  win.__microSlideActivationSimulateCommit = (fromPath?: string) => {
    syncEventRing();
    syncDryRunState();
    const path =
      fromPath ||
      dryRunState.active?.fromPath ||
      window.location.pathname.split("?")[0].split("#")[0] ||
      "/chats";
    traceDryRunIntegration("COMPLETE_WARM_SHUFFLE", `path=${path}|simulatedClick=true`);
    observeShuffleNavClickCommit(path);
    traceDryRunIntegration("ROUTER_PUSH_SHUFFLE", `path=${path}|skipped=dry-run-simulate`);
  };
  resumePendingDryRunReadinessLoop();
}
