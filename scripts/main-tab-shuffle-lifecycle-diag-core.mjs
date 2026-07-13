/**
 * Pure lifecycle diagnostic event expectations for harness validation.
 */

export function createModuleInstance(seed) {
  return {
    transitionModuleInstanceId: `module-${seed}-a1`,
    transitionModuleCreatedMono: seed,
  };
}

export function createTraceRingIdentity(seed) {
  return {
    traceRingInstanceId: `trace-ring-${seed}-1`,
    traceRingCreatedMono: seed,
  };
}

export function createTransaction(seed, navSeq = 1) {
  return {
    transactionId: `tx-${navSeq}-1-/chats`,
    navSeq,
    sourcePath: "/chats",
    createdMono: seed,
    phase: "sliding",
  };
}

export function simulateFailsafeSchedule(events, input) {
  events.push({
    kind: "SLIDE_FAILSAFE_SCHEDULED",
    timerId: input.timerId,
    transactionId: input.transactionId,
    expectedFireMono: input.expectedFireMono,
    moduleInstanceId: input.moduleInstanceId,
  });
}

export function simulateFailsafeClear(events, input) {
  events.push({
    kind: "SLIDE_FAILSAFE_CLEARED",
    timerId: input.timerId,
    transactionId: input.transactionId,
    caller: input.caller,
    reason: input.reason,
    moduleInstanceId: input.moduleInstanceId,
  });
}

export function simulateFailsafeCallback(events, input) {
  events.push({
    kind: "SLIDE_FAILSAFE_CALLBACK_ENTERED",
    timerId: input.timerId,
    scheduledTransactionId: input.scheduledTransactionId,
    currentTransactionId: input.currentTransactionId,
    currentPhase: input.currentPhase,
    moduleInstanceId: input.moduleInstanceId,
    traceRingInstanceId: input.traceRingInstanceId,
  });

  if (!input.currentTransactionId) {
    events.push({ kind: "SLIDE_FAILSAFE_SKIPPED_TX_NULL", timerId: input.timerId });
    return "skip-tx-null";
  }
  if (input.currentTransactionId !== input.scheduledTransactionId) {
    events.push({
      kind: "SLIDE_FAILSAFE_SKIPPED_TX_ID_MISMATCH",
      timerId: input.timerId,
      scheduledTransactionId: input.scheduledTransactionId,
      currentTransactionId: input.currentTransactionId,
    });
    return "skip-tx-id-mismatch";
  }
  if (input.currentPhase !== "sliding") {
    events.push({
      kind: "SLIDE_FAILSAFE_SKIPPED_PHASE_MISMATCH",
      timerId: input.timerId,
      currentPhase: input.currentPhase,
    });
    return "skip-phase-mismatch";
  }
  events.push({ kind: "SLIDE_FAILSAFE_SETTLE_ACCEPTED", timerId: input.timerId });
  return "settle-accepted";
}

export function simulateTransactionClear(events, input) {
  events.push({
    kind: "TRANSACTION_REF_CLEARED",
    transactionId: input.transactionId,
    caller: input.caller,
    reason: input.reason,
    moduleInstanceId: input.moduleInstanceId,
  });
}

export function simulateModuleReinit(events, previousModule, nextModule) {
  events.push({
    kind: "TRANSITION_MODULE_INSTANCE_CREATED",
    moduleInstanceId: nextModule.transitionModuleInstanceId,
    note: `previous=${previousModule.transitionModuleInstanceId}`,
  });
}

export function simulateHostChange(events, fromHostId, toHostId) {
  events.push({
    kind: "SHUFFLE_HOST_INSTANCE_CHANGED",
    shuffleHostInstanceId: toHostId,
    note: `${fromHostId}->${toHostId}`,
  });
}

export function simulateTraceRingReplace(events, previousRing, nextRing, reason) {
  events.push({
    kind: "TRACE_RING_REPLACED",
    traceRingInstanceId: nextRing.traceRingInstanceId,
    note: `previous=${previousRing.traceRingInstanceId}|reason=${reason}`,
  });
}

export function assertScenario(events, expectedKinds) {
  const kinds = events.map((event) => event.kind);
  for (const expected of expectedKinds) {
    if (!kinds.includes(expected)) {
      return {
        ok: false,
        reason: `missing ${expected} in ${kinds.join(",")}`,
      };
    }
  }
  return { ok: true, reason: null };
}

export function enumerateLifecycleHarnessPermutations() {
  const seeds = Array.from({ length: 1000 }, (_, index) => 1_700_000 + index);
  return seeds.map((seed) => ({ seed }));
}

export function runLifecycleHarnessCase({ seed }) {
  const events = [];
  const moduleA = createModuleInstance(seed);
  const moduleB = createModuleInstance(seed + 1);
  const ringA = createTraceRingIdentity(seed);
  const ringB = createTraceRingIdentity(seed + 2);
  const tx = createTransaction(seed);
  const timerId = `slide-fs-${seed}`;

  // A — scheduled → callback entered → settle accepted
  {
    const local = [];
    simulateFailsafeSchedule(local, {
      timerId,
      transactionId: tx.transactionId,
      expectedFireMono: seed + 190,
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    const outcome = simulateFailsafeCallback(local, {
      timerId,
      scheduledTransactionId: tx.transactionId,
      currentTransactionId: tx.transactionId,
      currentPhase: "sliding",
      moduleInstanceId: moduleA.transitionModuleInstanceId,
      traceRingInstanceId: ringA.traceRingInstanceId,
    });
    const verdict = assertScenario(local, [
      "SLIDE_FAILSAFE_SCHEDULED",
      "SLIDE_FAILSAFE_CALLBACK_ENTERED",
      "SLIDE_FAILSAFE_SETTLE_ACCEPTED",
    ]);
    if (!verdict.ok || outcome !== "settle-accepted") {
      return { pass: false, reason: `A:${verdict.reason ?? outcome}` };
    }
  }

  // B — scheduled → cleared by abort
  {
    const local = [];
    simulateFailsafeSchedule(local, {
      timerId,
      transactionId: tx.transactionId,
      expectedFireMono: seed + 190,
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    simulateFailsafeClear(local, {
      timerId,
      transactionId: tx.transactionId,
      caller: "abortMainTabToShuffleTransition",
      reason: "replaced",
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    simulateTransactionClear(local, {
      transactionId: tx.transactionId,
      caller: "abortMainTabToShuffleTransition",
      reason: "replaced",
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    const verdict = assertScenario(local, [
      "SLIDE_FAILSAFE_SCHEDULED",
      "SLIDE_FAILSAFE_CLEARED",
      "TRANSACTION_REF_CLEARED",
    ]);
    if (!verdict.ok) return { pass: false, reason: `B:${verdict.reason}` };
  }

  // C — callback with tx null
  {
    const local = [];
    simulateFailsafeSchedule(local, {
      timerId,
      transactionId: tx.transactionId,
      expectedFireMono: seed + 190,
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    const outcome = simulateFailsafeCallback(local, {
      timerId,
      scheduledTransactionId: tx.transactionId,
      currentTransactionId: null,
      currentPhase: null,
      moduleInstanceId: moduleA.transitionModuleInstanceId,
      traceRingInstanceId: ringA.traceRingInstanceId,
    });
    const verdict = assertScenario(local, [
      "SLIDE_FAILSAFE_CALLBACK_ENTERED",
      "SLIDE_FAILSAFE_SKIPPED_TX_NULL",
    ]);
    if (!verdict.ok || outcome !== "skip-tx-null") {
      return { pass: false, reason: `C:${verdict.reason ?? outcome}` };
    }
  }

  // D — tx id mismatch
  {
    const local = [];
    const outcome = simulateFailsafeCallback(local, {
      timerId,
      scheduledTransactionId: tx.transactionId,
      currentTransactionId: `tx-${seed}-other`,
      currentPhase: "sliding",
      moduleInstanceId: moduleA.transitionModuleInstanceId,
      traceRingInstanceId: ringA.traceRingInstanceId,
    });
    const verdict = assertScenario(local, ["SLIDE_FAILSAFE_SKIPPED_TX_ID_MISMATCH"]);
    if (!verdict.ok || outcome !== "skip-tx-id-mismatch") {
      return { pass: false, reason: `D:${verdict.reason ?? outcome}` };
    }
  }

  // E — phase mismatch
  {
    const local = [];
    const outcome = simulateFailsafeCallback(local, {
      timerId,
      scheduledTransactionId: tx.transactionId,
      currentTransactionId: tx.transactionId,
      currentPhase: "armed",
      moduleInstanceId: moduleA.transitionModuleInstanceId,
      traceRingInstanceId: ringA.traceRingInstanceId,
    });
    const verdict = assertScenario(local, ["SLIDE_FAILSAFE_SKIPPED_PHASE_MISMATCH"]);
    if (!verdict.ok || outcome !== "skip-phase-mismatch") {
      return { pass: false, reason: `E:${verdict.reason ?? outcome}` };
    }
  }

  // F — module M1 schedules, M2 exists later
  {
    const local = [];
    simulateFailsafeSchedule(local, {
      timerId,
      transactionId: tx.transactionId,
      expectedFireMono: seed + 190,
      moduleInstanceId: moduleA.transitionModuleInstanceId,
    });
    simulateModuleReinit(local, moduleA, moduleB);
    const outcome = simulateFailsafeCallback(local, {
      timerId,
      scheduledTransactionId: tx.transactionId,
      currentTransactionId: null,
      currentPhase: null,
      moduleInstanceId: moduleB.transitionModuleInstanceId,
      traceRingInstanceId: ringA.traceRingInstanceId,
    });
    const verdict = assertScenario(local, [
      "SLIDE_FAILSAFE_SCHEDULED",
      "TRANSITION_MODULE_INSTANCE_CREATED",
      "SLIDE_FAILSAFE_CALLBACK_ENTERED",
      "SLIDE_FAILSAFE_SKIPPED_TX_NULL",
    ]);
    if (!verdict.ok || outcome !== "skip-tx-null") {
      return { pass: false, reason: `F:${verdict.reason ?? outcome}` };
    }
  }

  // G — host H1 → H2
  {
    const local = [];
    local.push({
      kind: "TRANSITION_LISTENER_ATTACHED",
      hostInstanceId: "shuffle-host-1",
      transactionId: tx.transactionId,
    });
    simulateHostChange(local, "shuffle-host-1", "shuffle-host-2");
    const verdict = assertScenario(local, [
      "TRANSITION_LISTENER_ATTACHED",
      "SHUFFLE_HOST_INSTANCE_CHANGED",
    ]);
    if (!verdict.ok) return { pass: false, reason: `G:${verdict.reason}` };
  }

  // H — trace ring replaced
  {
    const local = [];
    local.push({ kind: "TRACE_RING_CREATED", traceRingInstanceId: ringA.traceRingInstanceId });
    simulateTraceRingReplace(local, ringA, ringB, "session-meta-mismatch");
    const verdict = assertScenario(local, ["TRACE_RING_CREATED", "TRACE_RING_REPLACED"]);
    if (!verdict.ok) return { pass: false, reason: `H:${verdict.reason}` };
  }

  events.push({ kind: "CASE_OK", seed });
  return { pass: true, reason: null };
}

export function runLifecycleHarness(total = 1000) {
  const permutations = enumerateLifecycleHarnessPermutations().slice(0, total);
  const failures = [];
  let pass = 0;
  for (const permutation of permutations) {
    const result = runLifecycleHarnessCase(permutation);
    if (result.pass) pass += 1;
    else failures.push({ seed: permutation.seed, reason: result.reason });
  }
  return { pass, fail: failures.length, total: permutations.length, failures };
}
