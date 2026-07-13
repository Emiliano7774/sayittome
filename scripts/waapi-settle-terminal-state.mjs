/**
 * Canonical WAAPI terminal-state reducer (tooling + capture).
 * Late fill-release cancels must not override physical-satisfied.
 */

export const WAAPI_TERMINAL_STATE = {
  PENDING: "pending",
  READY: "ready",
  RUNNING: "running",
  FINISHED_NATIVE: "finished-native",
  FINISHED_PROMOTED: "finished-promoted",
  PHYSICAL_SATISFIED: "physical-satisfied",
  CLEANUP_CANCELLED_AFTER_FINISH: "cleanup-cancelled-after-finish",
  CANCELLED_BEFORE_PHYSICAL: "cancelled-before-physical",
  REJECTED: "rejected",
  UNAVAILABLE: "unavailable",
  STALE_ABORTED: "stale-aborted",
};

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function kind(e) {
  return typeof e?.kind === "string" ? e.kind : "";
}

function mono(e) {
  return typeof e?.monoMs === "number" ? e.monoMs : null;
}

function reason(e) {
  return e?.reason ?? e?.note ?? null;
}

/**
 * Reduce hop trace into canonical WAAPI terminal state.
 */
export function reduceWaapiTerminalState(hopTrace = []) {
  const events = asArray(hopTrace).slice().sort((a, b) => (mono(a) ?? 0) - (mono(b) ?? 0));

  let terminal = WAAPI_TERMINAL_STATE.PENDING;
  let created = false;
  let ready = false;
  let started = false;
  let finishedNative = false;
  let finishedPromoted = false;
  let finalStylesCommitted = false;
  let physicalSatisfied = false;
  let unavailable = false;
  let rejected = false;
  let staleAborted = false;
  let cancelBeforePhysical = 0;
  let cancelAfterPhysical = 0;
  let fillReleaseCancelIgnored = 0;
  let promoteAccepted = false;
  let promoteRejected = false;
  let settleReasonCanonical = null;
  let fillReleaseStarted = false;

  for (const e of events) {
    const k = kind(e);
    const r = String(reason(e) || "");

    if (k === "MICRO_SLIDE_WAAPI_UNAVAILABLE_FALLBACK") {
      unavailable = true;
      terminal = WAAPI_TERMINAL_STATE.UNAVAILABLE;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_STALE_TX_ABORT") {
      if (!physicalSatisfied) {
        staleAborted = true;
        terminal = WAAPI_TERMINAL_STATE.STALE_ABORTED;
      }
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" || k === "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED") {
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_CREATED") {
      created = true;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_READY") {
      ready = true;
      if (!physicalSatisfied) terminal = WAAPI_TERMINAL_STATE.READY;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_STARTED") {
      started = true;
      if (!physicalSatisfied) terminal = WAAPI_TERMINAL_STATE.RUNNING;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED") {
      if (!physicalSatisfied) {
        rejected = true;
        terminal = WAAPI_TERMINAL_STATE.REJECTED;
      }
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_FILL_RELEASE_STARTED") {
      fillReleaseStarted = true;
      continue;
    }
    if (
      k === "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED" ||
      k === "MICRO_SLIDE_WAAPI_CANCEL_AFTER_PHYSICAL"
    ) {
      fillReleaseCancelIgnored += 1;
      cancelAfterPhysical += 1;
      if (physicalSatisfied) {
        terminal = WAAPI_TERMINAL_STATE.CLEANUP_CANCELLED_AFTER_FINISH;
      }
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED") {
      if (physicalSatisfied || finalStylesCommitted) {
        // Late cleanup / fill-release cancel — ignore for failure.
        cancelAfterPhysical += 1;
        fillReleaseCancelIgnored += 1;
        terminal = WAAPI_TERMINAL_STATE.CLEANUP_CANCELLED_AFTER_FINISH;
      } else {
        cancelBeforePhysical += 1;
        terminal = WAAPI_TERMINAL_STATE.CANCELLED_BEFORE_PHYSICAL;
      }
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED") {
      if (r.includes("promoted") || r.includes("watchdog")) {
        finishedPromoted = true;
        promoteAccepted = true;
        terminal = WAAPI_TERMINAL_STATE.FINISHED_PROMOTED;
      } else {
        finishedNative = true;
        terminal = WAAPI_TERMINAL_STATE.FINISHED_NATIVE;
      }
      continue;
    }
    if (
      k === "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED" ||
      k === "MICRO_SLIDE_WAAPI_FINISHED_PROMOTED_BY_WATCHDOG"
    ) {
      finishedPromoted = true;
      promoteAccepted = true;
      terminal = WAAPI_TERMINAL_STATE.FINISHED_PROMOTED;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REJECTED") {
      promoteRejected = true;
      continue;
    }
    if (k === "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED") {
      finalStylesCommitted = true;
      continue;
    }
    if (
      k === "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED" ||
      k === "MICRO_SLIDE_WAAPI_PHYSICAL_SATISFIED_CANONICAL"
    ) {
      physicalSatisfied = true;
      terminal = WAAPI_TERMINAL_STATE.PHYSICAL_SATISFIED;
      continue;
    }
    if (k === "SETTLE_INITIATED" || k === "SETTLED") {
      const sr = String(reason(e) || "");
      if (sr.includes("waapi-finish") || sr.includes("waapi-watchdog-promoted")) {
        settleReasonCanonical = sr.includes("promoted")
          ? "waapi-watchdog-promoted-finish"
          : "waapi-finish";
      } else if (!settleReasonCanonical) {
        settleReasonCanonical = sr || null;
      } else if (sr.includes("waapi")) {
        settleReasonCanonical = sr.includes("promoted")
          ? "waapi-watchdog-promoted-finish"
          : "waapi-finish";
      }
    }
  }

  // If finished + final styles but physical marker missing, still physical when promote/native finish.
  if (
    !physicalSatisfied &&
    finalStylesCommitted &&
    (finishedNative || finishedPromoted) &&
    cancelBeforePhysical === 0 &&
    !rejected &&
    !unavailable
  ) {
    physicalSatisfied = true;
    terminal = finishedPromoted
      ? WAAPI_TERMINAL_STATE.FINISHED_PROMOTED
      : WAAPI_TERMINAL_STATE.FINISHED_NATIVE;
  }

  if (physicalSatisfied && cancelAfterPhysical > 0) {
    terminal = WAAPI_TERMINAL_STATE.CLEANUP_CANCELLED_AFTER_FINISH;
  }

  const cleanEligibleTerminals = new Set([
    WAAPI_TERMINAL_STATE.FINISHED_NATIVE,
    WAAPI_TERMINAL_STATE.FINISHED_PROMOTED,
    WAAPI_TERMINAL_STATE.PHYSICAL_SATISFIED,
    WAAPI_TERMINAL_STATE.CLEANUP_CANCELLED_AFTER_FINISH,
  ]);

  const WAAPI_CANONICAL_PHYSICAL_SATISFIED =
    physicalSatisfied === true &&
    finalStylesCommitted === true &&
    cancelBeforePhysical === 0 &&
    !rejected &&
    !unavailable &&
    !staleAborted &&
    cleanEligibleTerminals.has(terminal);

  const settleOk =
    settleReasonCanonical === "waapi-finish" ||
    settleReasonCanonical === "waapi-watchdog-promoted-finish" ||
    (WAAPI_CANONICAL_PHYSICAL_SATISFIED &&
      (finishedNative || finishedPromoted));

  return {
    waapiTerminalState: terminal,
    waapiCanonicalPhysicalSatisfied: WAAPI_CANONICAL_PHYSICAL_SATISFIED && settleOk,
    waapiFinishedNative: finishedNative,
    waapiFinishedPromoted: finishedPromoted,
    waapiCleanupCancelAfterFinish: cancelAfterPhysical > 0 && physicalSatisfied,
    waapiCancelBeforePhysical: cancelBeforePhysical > 0,
    waapiPromoteAccepted: promoteAccepted,
    waapiPromoteRejected: promoteRejected,
    waapiFillReleaseCancelIgnored: fillReleaseCancelIgnored > 0,
    settleReasonCanonical:
      WAAPI_CANONICAL_PHYSICAL_SATISFIED && finishedPromoted && !finishedNative
        ? "waapi-watchdog-promoted-finish"
        : WAAPI_CANONICAL_PHYSICAL_SATISFIED
          ? settleReasonCanonical || "waapi-finish"
          : settleReasonCanonical,
    rawCancelCount: cancelBeforePhysical + cancelAfterPhysical,
    rawCancelAfterPhysicalCount: cancelAfterPhysical,
    rawCancelBeforePhysicalCount: cancelBeforePhysical,
    created,
    ready,
    started,
    finalStylesCommitted,
    physicalSatisfied,
    unavailable,
    rejected,
    staleAborted,
    fillReleaseStarted,
    WAAPI_CANCEL_AFTER_FILL_RELEASE_IGNORED_FOR_CLEAN:
      physicalSatisfied && cancelAfterPhysical > 0,
  };
}

export function evaluatePromoteAcceptance({
  created = false,
  ready = false,
  started = false,
  cancelledBeforePhysical = false,
  rejected = false,
  unavailable = false,
  txCurrent = true,
  surfacesValid = true,
  finalStylesCommitted = false,
} = {}) {
  const ok =
    created &&
    ready &&
    started &&
    !cancelledBeforePhysical &&
    !rejected &&
    !unavailable &&
    txCurrent &&
    surfacesValid &&
    finalStylesCommitted;
  return {
    accepted: ok,
    reason: ok
      ? "promote-accepted"
      : !created
        ? "missing-created"
        : !ready
          ? "missing-ready"
          : !started
            ? "missing-started"
            : cancelledBeforePhysical
              ? "cancelled-before-physical"
              : rejected
                ? "rejected"
                : unavailable
                  ? "unavailable"
                  : !txCurrent
                    ? "tx-not-current"
                    : !surfacesValid
                      ? "surfaces-invalid"
                      : !finalStylesCommitted
                        ? "final-styles-missing"
                        : "rejected",
  };
}
