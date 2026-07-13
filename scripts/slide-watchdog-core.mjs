/**
 * Pure three-stage slide watchdog model for harness validation.
 * Anchors: PHASE_SLIDING → final write → LAST_OBSERVED_VALID_START → end.
 */

export const SLIDE_DURATION_MS = 110;
export const SLIDE_FAILSAFE_SLACK_MS = 80;
export const END_WATCHDOG_DELAY_MS = SLIDE_DURATION_MS + SLIDE_FAILSAFE_SLACK_MS; // 190
export const PRE_WRITE_WATCHDOG_DELAY_MS = END_WATCHDOG_DELAY_MS;
export const POST_WRITE_PRE_START_WATCHDOG_DELAY_MS = END_WATCHDOG_DELAY_MS;

export function createCanonicalRuntime(seed = 0) {
  return {
    runtimeInstanceId: `presentation-runtime-${seed}`,
    activeTx: null,
    slidePreWriteWatchdogHandle: null,
    slidePreWriteWatchdogId: null,
    slidePreWriteWatchdogScheduledTransactionId: null,
    slidePostWritePreStartWatchdogHandle: null,
    slidePostWritePreStartWatchdogId: null,
    slidePostWritePreStartWatchdogScheduledTransactionId: null,
    slideEndWatchdogHandle: null,
    slideEndWatchdogId: null,
    slideEndWatchdogScheduledTransactionId: null,
    slideFinalWriteCommittedMono: null,
    sourceTransitionStartedMono: null,
    destinationTransitionStartedMono: null,
    slideTransitionStartedMono: null,
    settleCount: 0,
    lastSettleReason: null,
    lastSettleMono: null,
    endWatchdogScheduleCount: 0,
    endWatchdogReanchorCount: 0,
    events: [],
    timerSeq: 0,
    timers: new Map(),
    now: seed,
  };
}

function push(runtime, kind, extra = {}) {
  runtime.events.push({ kind, mono: runtime.now, ...extra });
}

function nextTimerId(runtime, prefix) {
  runtime.timerSeq += 1;
  return `${prefix}-${runtime.timerSeq}`;
}

function clearTimer(runtime, handleKey, idKey, txKey, reason, stage, eventKind) {
  const id = runtime[idKey];
  const handle = runtime[handleKey];
  if (!id && !handle) {
    runtime[handleKey] = null;
    runtime[idKey] = null;
    runtime[txKey] = null;
    return false;
  }
  if (id) {
    push(runtime, eventKind, { timerId: id, reason: `${stage}:${reason}`, stage });
    const t = runtime.timers.get(id);
    if (t) t.cleared = true;
  }
  runtime[handleKey] = null;
  runtime[idKey] = null;
  runtime[txKey] = null;
  return true;
}

export function clearPreWriteWatchdog(runtime, reason) {
  return clearTimer(
    runtime,
    "slidePreWriteWatchdogHandle",
    "slidePreWriteWatchdogId",
    "slidePreWriteWatchdogScheduledTransactionId",
    reason,
    "pre-write",
    "SLIDE_PRE_WRITE_WATCHDOG_CLEARED",
  );
}

export function clearPostWritePreStartWatchdog(runtime, reason) {
  return clearTimer(
    runtime,
    "slidePostWritePreStartWatchdogHandle",
    "slidePostWritePreStartWatchdogId",
    "slidePostWritePreStartWatchdogScheduledTransactionId",
    reason,
    "pre-start",
    "SLIDE_POST_WRITE_PRE_START_WATCHDOG_CLEARED",
  );
}

export function clearEndWatchdog(runtime, reason) {
  return clearTimer(
    runtime,
    "slideEndWatchdogHandle",
    "slideEndWatchdogId",
    "slideEndWatchdogScheduledTransactionId",
    reason,
    "end",
    "SLIDE_END_WATCHDOG_CLEARED",
  );
}

export function clearAllSlideWatchdogs(runtime, reason) {
  clearPreWriteWatchdog(runtime, reason);
  clearPostWritePreStartWatchdog(runtime, reason);
  clearEndWatchdog(runtime, reason);
  runtime.slideFinalWriteCommittedMono = null;
  runtime.sourceTransitionStartedMono = null;
  runtime.destinationTransitionStartedMono = null;
  runtime.slideTransitionStartedMono = null;
}

export function beginSliding(runtime, txId) {
  runtime.activeTx = { transactionId: txId, phase: "sliding" };
  runtime.slideFinalWriteCommittedMono = null;
  runtime.sourceTransitionStartedMono = null;
  runtime.destinationTransitionStartedMono = null;
  runtime.slideTransitionStartedMono = null;
  armPreWriteWatchdog(runtime, txId);
}

export function armPreWriteWatchdog(runtime, txId) {
  clearPreWriteWatchdog(runtime, "reschedule");
  const timerId = nextTimerId(runtime, "pre");
  const fireAt = runtime.now + PRE_WRITE_WATCHDOG_DELAY_MS;
  runtime.slidePreWriteWatchdogId = timerId;
  runtime.slidePreWriteWatchdogHandle = timerId;
  runtime.slidePreWriteWatchdogScheduledTransactionId = txId;
  runtime.timers.set(timerId, { fireAt, kind: "pre-write", txId, cleared: false });
  push(runtime, "SLIDE_PRE_WRITE_WATCHDOG_SCHEDULED", {
    timerId,
    expectedFireMono: fireAt,
    transactionId: txId,
  });
}

export function noteFinalWriteCommitted(runtime) {
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "sliding") return { ok: false, reason: "not-sliding" };
  if (runtime.slideFinalWriteCommittedMono != null) return { ok: true, duplicate: true };
  runtime.slideFinalWriteCommittedMono = runtime.now;
  clearPreWriteWatchdog(runtime, "final-write-committed");
  push(runtime, "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL", {
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
  });
  armPostWritePreStartWatchdog(runtime, tx.transactionId, runtime.slideFinalWriteCommittedMono);
  return { ok: true, duplicate: false };
}

export function armPostWritePreStartWatchdog(runtime, txId, committedMono) {
  clearPostWritePreStartWatchdog(runtime, "reschedule");
  const timerId = nextTimerId(runtime, "prestart");
  const fireAt = committedMono + POST_WRITE_PRE_START_WATCHDOG_DELAY_MS;
  runtime.slidePostWritePreStartWatchdogId = timerId;
  runtime.slidePostWritePreStartWatchdogHandle = timerId;
  runtime.slidePostWritePreStartWatchdogScheduledTransactionId = txId;
  runtime.timers.set(timerId, {
    fireAt: Math.max(fireAt, runtime.now),
    kind: "pre-start",
    txId,
    cleared: false,
  });
  push(runtime, "SLIDE_POST_WRITE_PRE_START_WATCHDOG_SCHEDULED", {
    timerId,
    expectedFireMono: fireAt,
    transactionId: txId,
  });
}

export function armEndWatchdogFromStart(runtime, txId, startedMono, reason) {
  if (runtime.slideTransitionStartedMono == null) return false;
  clearEndWatchdog(runtime, reason);
  const timerId = nextTimerId(runtime, "end");
  const fireAt = startedMono + END_WATCHDOG_DELAY_MS;
  runtime.slideEndWatchdogId = timerId;
  runtime.slideEndWatchdogHandle = timerId;
  runtime.slideEndWatchdogScheduledTransactionId = txId;
  runtime.endWatchdogScheduleCount += 1;
  if (reason === "reanchor-later-start") runtime.endWatchdogReanchorCount += 1;
  runtime.timers.set(timerId, {
    fireAt: Math.max(fireAt, runtime.now),
    kind: "end",
    txId,
    cleared: false,
    startedMono,
  });
  push(runtime, "SLIDE_END_WATCHDOG_SCHEDULED", {
    timerId,
    expectedFireMono: fireAt,
    transactionId: txId,
    slideTransitionStartedMono: startedMono,
    reason,
  });
  return true;
}

export function noteNativeTransitionStart(runtime, nodeRole, startMono = runtime.now) {
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "sliding") return { ok: false, reason: "not-sliding" };
  if (runtime.slideFinalWriteCommittedMono == null) return { ok: false, reason: "no-final-write" };

  if (nodeRole === "source") {
    if (runtime.sourceTransitionStartedMono != null) return { ok: true, duplicate: true };
    runtime.sourceTransitionStartedMono = startMono;
  } else if (nodeRole === "destination") {
    if (runtime.destinationTransitionStartedMono != null) return { ok: true, duplicate: true };
    runtime.destinationTransitionStartedMono = startMono;
  } else {
    return { ok: false, reason: "bad-role" };
  }

  push(runtime, "SLIDE_NATIVE_TRANSITION_START_OBSERVED", {
    nodeRole,
    sourceTransitionStartedMono: runtime.sourceTransitionStartedMono,
    destinationTransitionStartedMono: runtime.destinationTransitionStartedMono,
  });

  const candidates = [
    runtime.sourceTransitionStartedMono,
    runtime.destinationTransitionStartedMono,
  ].filter((v) => v != null);
  const lastStart = Math.max(...candidates);
  const previous = runtime.slideTransitionStartedMono;
  const isFirst = previous == null;
  const isLater = previous != null && lastStart > previous;
  if (!isFirst && !isLater) return { ok: true, duplicate: true };

  runtime.slideTransitionStartedMono = lastStart;
  clearPostWritePreStartWatchdog(
    runtime,
    isFirst ? "first-valid-transition-start" : "later-surface-start",
  );
  push(runtime, "SLIDE_TRANSITION_START_ANCHOR_COMMITTED", {
    slideTransitionStartedMono: lastStart,
    reason: isFirst ? "first-valid-start" : "reanchor-later-start",
  });
  armEndWatchdogFromStart(
    runtime,
    tx.transactionId,
    lastStart,
    isFirst ? "first-valid-start" : "reanchor-later-start",
  );
  return { ok: true, reanchored: isLater, first: isFirst };
}

function trySettle(runtime, reason, timerId) {
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "sliding") return false;
  push(runtime, "SLIDE_SETTLE_INITIATED", { reason, timerId, transactionId: tx.transactionId });
  clearAllSlideWatchdogs(runtime, reason);
  tx.phase = "settled";
  runtime.settleCount += 1;
  runtime.lastSettleReason = reason;
  runtime.lastSettleMono = runtime.now;
  push(runtime, "SETTLED", { reason });
  return true;
}

export function deliverNativeTransitionEnd(runtime) {
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "sliding") return false;
  push(runtime, "TRANSITION_END");
  return trySettle(runtime, "transitionend", null);
}

export function abortSliding(runtime, reason) {
  const tx = runtime.activeTx;
  if (!tx) return false;
  clearAllSlideWatchdogs(runtime, reason);
  tx.phase = "aborted";
  runtime.activeTx = null;
  push(runtime, "ABORTED", { reason });
  return true;
}

export function simulateModuleReinit(runtime) {
  push(runtime, "TRANSITION_MODULE_INSTANCE_CREATED", {
    note: "module-reinit-canonical-runtime-preserved",
    slidePreWriteWatchdogId: runtime.slidePreWriteWatchdogId,
    slidePostWritePreStartWatchdogId: runtime.slidePostWritePreStartWatchdogId,
    slideEndWatchdogId: runtime.slideEndWatchdogId,
    slideFinalWriteCommittedMono: runtime.slideFinalWriteCommittedMono,
    slideTransitionStartedMono: runtime.slideTransitionStartedMono,
    sourceTransitionStartedMono: runtime.sourceTransitionStartedMono,
    destinationTransitionStartedMono: runtime.destinationTransitionStartedMono,
  });
  return {
    preId: runtime.slidePreWriteWatchdogId,
    preStartId: runtime.slidePostWritePreStartWatchdogId,
    endId: runtime.slideEndWatchdogId,
    finalMono: runtime.slideFinalWriteCommittedMono,
    startMono: runtime.slideTransitionStartedMono,
  };
}

export function advanceTo(runtime, targetMono) {
  while (true) {
    let next = null;
    for (const [id, t] of runtime.timers) {
      if (t.cleared) continue;
      if (t.fireAt > targetMono) continue;
      if (!next || t.fireAt < next.fireAt) next = { id, ...t };
    }
    if (!next) {
      runtime.now = targetMono;
      return;
    }
    runtime.now = next.fireAt;
    fireTimer(runtime, next.id);
  }
}

function fireTimer(runtime, timerId) {
  const t = runtime.timers.get(timerId);
  if (!t || t.cleared) return;
  t.cleared = true;
  const kindEvent =
    t.kind === "pre-write"
      ? "SLIDE_PRE_WRITE_WATCHDOG_CALLBACK_ENTERED"
      : t.kind === "pre-start"
        ? "SLIDE_POST_WRITE_PRE_START_WATCHDOG_CALLBACK_ENTERED"
        : "SLIDE_END_WATCHDOG_CALLBACK_ENTERED";
  push(runtime, kindEvent, { timerId, kind: t.kind, scheduledTransactionId: t.txId });
  const tx = runtime.activeTx;
  if (!tx || tx.phase !== "sliding" || tx.transactionId !== t.txId) {
    push(runtime, "SLIDE_WATCHDOG_SKIPPED_TX_OR_PHASE", { timerId });
    return;
  }
  if (t.kind === "pre-write") {
    if (runtime.slideFinalWriteCommittedMono != null) return;
    trySettle(runtime, "final-write-never-committed", timerId);
    return;
  }
  if (t.kind === "pre-start") {
    if (runtime.slideTransitionStartedMono != null) return;
    trySettle(runtime, "transition-never-started-after-final-write", timerId);
    return;
  }
  if (t.kind === "end") {
    const startMono = runtime.slideTransitionStartedMono;
    if (startMono == null) return;
    if (runtime.now < startMono + SLIDE_DURATION_MS) {
      push(runtime, "WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START", {
        timerId,
        now: runtime.now,
        minSettle: startMono + SLIDE_DURATION_MS,
      });
      return;
    }
    if (runtime.now < startMono + END_WATCHDOG_DELAY_MS) {
      push(runtime, "WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START", {
        timerId,
        now: runtime.now,
        slackDeadline: startMono + END_WATCHDOG_DELAY_MS,
      });
      return;
    }
    trySettle(runtime, "post-transition-start-end-watchdog", timerId);
  }
}

export function evaluateInvariants(runtime, scenario) {
  const events = runtime.events;
  const fails = [];

  for (const e of events) {
    if (e.kind !== "SLIDE_END_WATCHDOG_SCHEDULED") continue;
    const priorStart = events.some(
      (x) => x.kind === "SLIDE_TRANSITION_START_ANCHOR_COMMITTED" && x.mono <= e.mono,
    );
    if (!priorStart) fails.push("NO_END_WATCHDOG_BEFORE_VALID_TRANSITION_START");
  }

  if (scenario.expectFirstStart) {
    const firstStart = events.find((e) => e.kind === "SLIDE_TRANSITION_START_ANCHOR_COMMITTED");
    if (firstStart) {
      const cleared = events.some(
        (e) =>
          e.kind === "SLIDE_POST_WRITE_PRE_START_WATCHDOG_CLEARED" && e.mono <= firstStart.mono + 0,
      );
      if (!cleared) fails.push("POST_WRITE_PRE_START_WATCHDOG_CLEARED_ON_FIRST_VALID_TRANSITION_START");
    }
  }

  const endScheds = events.filter((e) => e.kind === "SLIDE_END_WATCHDOG_SCHEDULED");
  for (const e of endScheds) {
    if (
      e.expectedFireMono != null &&
      e.slideTransitionStartedMono != null &&
      e.expectedFireMono !== e.slideTransitionStartedMono + END_WATCHDOG_DELAY_MS
    ) {
      fails.push("END_WATCHDOG_BUDGET_PRESERVES_110_PLUS_80_FROM_CHOSEN_START");
    }
  }

  // ONE_END_WATCHDOG_PER_TX: never two uncleared end timers at once
  let activeEnds = 0;
  for (const e of events) {
    if (e.kind === "SLIDE_END_WATCHDOG_SCHEDULED") activeEnds += 1;
    if (e.kind === "SLIDE_END_WATCHDOG_CLEARED") activeEnds = Math.max(0, activeEnds - 1);
    if (activeEnds > 1) fails.push("ONE_END_WATCHDOG_PER_TX");
  }

  if (scenario.nativeEndWins && runtime.lastSettleReason !== "transitionend") {
    fails.push("NATIVE_TRANSITION_END_WINS");
  }
  if (runtime.settleCount > 1) fails.push("NO_DOUBLE_SETTLE");

  const preempt110 = events.filter(
    (e) => e.kind === "WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START",
  ).length;
  const preempt190 = events.filter(
    (e) => e.kind === "WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START",
  ).length;
  if (preempt110 > 0) fails.push("WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START");
  if (preempt190 > 0) fails.push("WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START");

  if (scenario.expectReanchor) {
    const reanchors = events.filter(
      (e) => e.kind === "SLIDE_END_WATCHDOG_SCHEDULED" && e.reason === "reanchor-later-start",
    );
    if (!reanchors.length) fails.push("END_WATCHDOG_REANCHORED_IF_LATER_SURFACE_STARTS");
  }

  if (scenario.moduleReinit && !scenario.moduleReinitAllowEmpty) {
    const preserved = events.some(
      (e) =>
        e.kind === "TRANSITION_MODULE_INSTANCE_CREATED" &&
        (e.slideEndWatchdogId != null ||
          e.slideTransitionStartedMono != null ||
          e.slideFinalWriteCommittedMono != null ||
          e.slidePreWriteWatchdogId != null ||
          e.slidePostWritePreStartWatchdogId != null),
    );
    if (!preserved) fails.push("TRANSITION_START_ANCHOR_CANONICAL_ACROSS_MODULE_REINIT");
  }

  return {
    ok: fails.length === 0,
    fails: [...new Set(fails)],
    preempt110,
    preempt190,
    settleCount: runtime.settleCount,
    lastSettleReason: runtime.lastSettleReason,
  };
}

export function runWatchdogScenario(input) {
  const {
    seed,
    finalWriteDelayMs = 0,
    transitionStartAfterWriteMs = 0,
    sourceDestSkewMs = 0,
    nativeEndLagMs = 0,
    finalWriteNeverCommits = false,
    noTransitionStart = false,
    sourceStartOnly = false,
    destinationStartOnly = false,
    sourceFirstThenDest = false,
    destinationFirstThenSource = false,
    abortBeforeFinalWrite = false,
    abortAfterFinalWriteBeforeStart = false,
    abortAfterFirstStart = false,
    transitionendBeforeWatchdog = true,
    transitionendAbsent = false,
    moduleReinitBeforeFinalWrite = false,
    moduleReinitAfterFinalWriteBeforeStart = false,
    moduleReinitAfterFirstStart = false,
    staleOldModuleCallback = false,
    duplicateClear = false,
    duplicateTransitionend = false,
    duplicateSourceStart = false,
    duplicateDestinationStart = false,
  } = input;

  const runtime = createCanonicalRuntime(seed);
  const txId = `tx-${seed}`;
  beginSliding(runtime, txId);

  if (moduleReinitBeforeFinalWrite) simulateModuleReinit(runtime);

  if (abortBeforeFinalWrite) {
    advanceTo(runtime, runtime.now + Math.min(finalWriteDelayMs, 50));
    abortSliding(runtime, "abort-before-final-write");
    if (duplicateClear) clearAllSlideWatchdogs(runtime, "duplicate-clear");
    if (staleOldModuleCallback) {
      push(runtime, "SLIDE_PRE_WRITE_WATCHDOG_CALLBACK_ENTERED", { timerId: "stale-pre" });
    }
    return finalize(runtime, {
      expectFirstStart: false,
      nativeEndWins: false,
      moduleReinit: moduleReinitBeforeFinalWrite,
      moduleReinitAllowEmpty: true,
    });
  }

  if (finalWriteNeverCommits) {
    advanceTo(runtime, runtime.now + PRE_WRITE_WATCHDOG_DELAY_MS + 1);
    return finalize(runtime, { expectFirstStart: false, nativeEndWins: false });
  }

  advanceTo(runtime, runtime.now + finalWriteDelayMs);
  noteFinalWriteCommitted(runtime);

  if (moduleReinitAfterFinalWriteBeforeStart) simulateModuleReinit(runtime);

  if (abortAfterFinalWriteBeforeStart) {
    advanceTo(runtime, runtime.now + 10);
    abortSliding(runtime, "abort-after-final-write");
    return finalize(runtime, {
      expectFirstStart: false,
      nativeEndWins: false,
      moduleReinit: moduleReinitAfterFinalWriteBeforeStart,
    });
  }

  if (noTransitionStart) {
    advanceTo(runtime, runtime.slideFinalWriteCommittedMono + POST_WRITE_PRE_START_WATCHDOG_DELAY_MS + 1);
    return finalize(runtime, { expectFirstStart: false, nativeEndWins: false });
  }

  // Deliver starts
  advanceTo(runtime, runtime.now + transitionStartAfterWriteMs);
  let expectReanchor = false;
  if (sourceStartOnly) {
    noteNativeTransitionStart(runtime, "source");
    if (duplicateSourceStart) noteNativeTransitionStart(runtime, "source");
  } else if (destinationStartOnly) {
    noteNativeTransitionStart(runtime, "destination");
    if (duplicateDestinationStart) noteNativeTransitionStart(runtime, "destination");
  } else if (sourceFirstThenDest) {
    noteNativeTransitionStart(runtime, "source");
    if (sourceDestSkewMs > 0) {
      advanceTo(runtime, runtime.now + sourceDestSkewMs);
      const r = noteNativeTransitionStart(runtime, "destination");
      expectReanchor = Boolean(r.reanchored);
    }
  } else if (destinationFirstThenSource) {
    noteNativeTransitionStart(runtime, "destination");
    if (sourceDestSkewMs > 0) {
      advanceTo(runtime, runtime.now + sourceDestSkewMs);
      const r = noteNativeTransitionStart(runtime, "source");
      expectReanchor = Boolean(r.reanchored);
    }
  } else {
    // default: destination then optional source skew
    noteNativeTransitionStart(runtime, "destination");
    if (sourceDestSkewMs > 0 && !destinationStartOnly) {
      advanceTo(runtime, runtime.now + sourceDestSkewMs);
      const r = noteNativeTransitionStart(runtime, "source");
      expectReanchor = Boolean(r.reanchored);
    }
  }

  if (moduleReinitAfterFirstStart) simulateModuleReinit(runtime);

  if (abortAfterFirstStart) {
    advanceTo(runtime, runtime.now + 10);
    abortSliding(runtime, "abort-after-first-start");
    return finalize(runtime, {
      expectFirstStart: true,
      expectReanchor,
      nativeEndWins: false,
      moduleReinit: moduleReinitAfterFirstStart,
    });
  }

  if (transitionendAbsent) {
    advanceTo(runtime, runtime.slideTransitionStartedMono + END_WATCHDOG_DELAY_MS + 1);
    return finalize(runtime, {
      expectFirstStart: true,
      expectReanchor,
      nativeEndWins: false,
      moduleReinit: moduleReinitAfterFirstStart || moduleReinitAfterFinalWriteBeforeStart,
    });
  }

  if (transitionendBeforeWatchdog) {
    const teAt = runtime.slideTransitionStartedMono + SLIDE_DURATION_MS + nativeEndLagMs;
    advanceTo(runtime, teAt);
    deliverNativeTransitionEnd(runtime);
    if (duplicateTransitionend) deliverNativeTransitionEnd(runtime);
    advanceTo(runtime, runtime.slideTransitionStartedMono + END_WATCHDOG_DELAY_MS + 50);
    return finalize(runtime, {
      expectFirstStart: true,
      expectReanchor,
      nativeEndWins: true,
      moduleReinit:
        moduleReinitAfterFirstStart ||
        moduleReinitAfterFinalWriteBeforeStart ||
        moduleReinitBeforeFinalWrite,
      moduleReinitAllowEmpty: moduleReinitBeforeFinalWrite && !moduleReinitAfterFirstStart,
    });
  }

  advanceTo(runtime, runtime.slideTransitionStartedMono + END_WATCHDOG_DELAY_MS + 1);
  return finalize(runtime, { expectFirstStart: true, expectReanchor, nativeEndWins: false });
}

function finalize(runtime, scenario) {
  const inv = evaluateInvariants(runtime, scenario);
  return {
    pass: inv.ok,
    fails: inv.fails,
    settleCount: inv.settleCount,
    lastSettleReason: inv.lastSettleReason,
    preempt110: inv.preempt110,
    preempt190: inv.preempt190,
    endWatchdogScheduleCount: runtime.endWatchdogScheduleCount,
    endWatchdogReanchorCount: runtime.endWatchdogReanchorCount,
    events: runtime.events,
  };
}

export function enumerateWatchdogHarnessCases() {
  const finalWriteDelays = [0, 1, 11, 33, 62, 100, 113, 140, 155, 189];
  const startAfterWrite = [0, 1, 5, 16, 33, 62, 80, 100, 113, 136, 140, 155, 189];
  const skews = [0, 1, 5, 16, 33, 60, 100];
  const endLags = [0, 5, 16, 33, 60, 79];
  const cases = [];
  let seed = 1;

  for (const finalWriteDelayMs of finalWriteDelays) {
    for (const transitionStartAfterWriteMs of startAfterWrite) {
      for (const nativeEndLagMs of endLags) {
        cases.push({
          seed: seed++,
          finalWriteDelayMs,
          transitionStartAfterWriteMs,
          nativeEndLagMs,
          destinationStartOnly: true,
          transitionendBeforeWatchdog: true,
        });
        cases.push({
          seed: seed++,
          finalWriteDelayMs,
          transitionStartAfterWriteMs,
          nativeEndLagMs,
          destinationStartOnly: true,
          transitionendAbsent: true,
        });
      }
    }
  }

  for (const skew of skews) {
    for (const transitionStartAfterWriteMs of [0, 33, 113, 155]) {
      cases.push({
        seed: seed++,
        finalWriteDelayMs: 33,
        transitionStartAfterWriteMs,
        sourceDestSkewMs: skew,
        sourceFirstThenDest: true,
        transitionendBeforeWatchdog: true,
        nativeEndLagMs: 16,
      });
      cases.push({
        seed: seed++,
        finalWriteDelayMs: 62,
        transitionStartAfterWriteMs,
        sourceDestSkewMs: skew,
        destinationFirstThenSource: true,
        transitionendAbsent: true,
        nativeEndLagMs: 0,
      });
    }
  }

  const specials = [
    { finalWriteNeverCommits: true },
    { noTransitionStart: true },
    { sourceStartOnly: true, transitionendBeforeWatchdog: true },
    { destinationStartOnly: true, transitionendBeforeWatchdog: true },
    { abortBeforeFinalWrite: true },
    { abortAfterFinalWriteBeforeStart: true },
    { abortAfterFirstStart: true, destinationStartOnly: true },
    { moduleReinitBeforeFinalWrite: true, destinationStartOnly: true, transitionendBeforeWatchdog: true },
    {
      moduleReinitAfterFinalWriteBeforeStart: true,
      destinationStartOnly: true,
      transitionendBeforeWatchdog: true,
    },
    {
      moduleReinitAfterFirstStart: true,
      destinationStartOnly: true,
      transitionendBeforeWatchdog: true,
    },
    { destinationStartOnly: true, duplicateDestinationStart: true, transitionendBeforeWatchdog: true },
    { sourceStartOnly: true, duplicateSourceStart: true, transitionendBeforeWatchdog: true },
    { destinationStartOnly: true, duplicateTransitionend: true, transitionendBeforeWatchdog: true },
    { abortBeforeFinalWrite: true, duplicateClear: true, staleOldModuleCallback: true },
    {
      sourceFirstThenDest: true,
      sourceDestSkewMs: 60,
      transitionStartAfterWriteMs: 113,
      transitionendAbsent: true,
    },
  ];

  for (const finalWriteDelayMs of [0, 33, 113, 155]) {
    for (const special of specials) {
      cases.push({
        seed: seed++,
        finalWriteDelayMs,
        transitionStartAfterWriteMs: 33,
        nativeEndLagMs: 16,
        ...special,
      });
    }
  }

  while (cases.length < 10_000) {
    const i = cases.length;
    cases.push({
      seed: seed++,
      finalWriteDelayMs: finalWriteDelays[i % finalWriteDelays.length],
      transitionStartAfterWriteMs: startAfterWrite[i % startAfterWrite.length],
      sourceDestSkewMs: skews[i % skews.length],
      nativeEndLagMs: endLags[i % endLags.length],
      destinationStartOnly: i % 5 !== 0,
      sourceFirstThenDest: i % 5 === 0,
      transitionendBeforeWatchdog: i % 3 !== 0,
      transitionendAbsent: i % 3 === 0,
      moduleReinitAfterFirstStart: i % 11 === 0,
    });
  }

  return cases.slice(0, 10_000);
}

export function runSlideWatchdogHarness() {
  const cases = enumerateWatchdogHarnessCases();
  let pass = 0;
  let fail = 0;
  const failures = [];
  let preempt110 = 0;
  let preempt190 = 0;
  let endSched = 0;
  let reanchor = 0;
  let nativeEndWins = 0;
  let endWatchdogSettle = 0;
  let preStartSettle = 0;
  let preWriteSettle = 0;

  for (const c of cases) {
    const result = runWatchdogScenario(c);
    if (result.pass) pass += 1;
    else {
      fail += 1;
      if (failures.length < 20) {
        failures.push({ seed: c.seed, fails: result.fails, lastSettleReason: result.lastSettleReason });
      }
    }
    preempt110 += result.preempt110;
    preempt190 += result.preempt190;
    endSched += result.endWatchdogScheduleCount;
    reanchor += result.endWatchdogReanchorCount;
    if (result.lastSettleReason === "transitionend") nativeEndWins += 1;
    if (result.lastSettleReason === "post-transition-start-end-watchdog") endWatchdogSettle += 1;
    if (result.lastSettleReason === "transition-never-started-after-final-write") preStartSettle += 1;
    if (result.lastSettleReason === "final-write-never-committed") preWriteSettle += 1;
  }

  return {
    pass,
    fail,
    total: cases.length,
    failures,
    preempt110,
    preempt190,
    endSched,
    reanchor,
    nativeEndWins,
    endWatchdogSettle,
    preStartSettle,
    preWriteSettle,
  };
}
