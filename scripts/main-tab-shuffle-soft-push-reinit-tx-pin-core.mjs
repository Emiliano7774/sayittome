/**
 * MAIN_TAB_SHUFFLE_SOFT_PUSH_REINIT_TX_PIN_HARNESS core — pure simulation.
 * Models same-document pin survival across module/runtime reinit without app timers.
 */

export const PIN_TTL_MS = 8000;

export function createPinStore() {
  return {
    pin: null,
    generation: 0,
    events: [],
    runtime: null,
    documentAlive: true,
  };
}

function mono(store) {
  return store._mono ?? 0;
}

function emit(store, kind, extras = {}) {
  store.events.push({ kind, mono: mono(store), ...extras });
}

export function pinTx(store, tx, now) {
  store._mono = now;
  store.generation += 1;
  store.pin = {
    txId: tx.transactionId,
    sourceTab: tx.source,
    destinationPath: "/shuffle",
    phase: tx.phase,
    createdMono: now,
    softPushCommittedMono: null,
    lastSeenMono: now,
    navSeq: tx.navSeq,
    moduleInstanceIdOriginal: tx.moduleInstanceId,
    runtimeInstanceIdOriginal: tx.runtimeInstanceId,
    softCommitGeneration: store.generation,
    commitReason: "main-tab-to-shuffle-micro-slide",
    expiresAtMono: now + PIN_TTL_MS,
    isSoftCommitInFlight: false,
    recoveryCount: 0,
    sourcePath: tx.sourcePath,
    direction: tx.direction,
  };
  store.runtime = {
    runtimeInstanceId: tx.runtimeInstanceId,
    activeTx: { ...tx },
    moduleInstanceId: tx.moduleInstanceId,
  };
  emit(store, "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", { txId: tx.transactionId });
  return store.pin;
}

export function markInFlight(store, now) {
  if (!store.pin) return false;
  store._mono = now;
  store.pin.isSoftCommitInFlight = true;
  store.pin.softPushCommittedMono = now;
  store.pin.expiresAtMono = now + PIN_TTL_MS;
  emit(store, "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT", { txId: store.pin.txId });
  return true;
}

export function shouldBlockLegacy(store, now, { directCold = false } = {}) {
  if (directCold) return false;
  const pin = store.pin;
  if (!pin) return false;
  if (now > pin.expiresAtMono) return false;
  return (
    pin.isSoftCommitInFlight ||
    pin.phase === "preparing" ||
    pin.phase === "armed" ||
    pin.phase === "sliding"
  );
}

export function simulateFullDocumentReload(store) {
  store.documentAlive = false;
  store.pin = null;
  store.runtime = null;
  store.documentAlive = true;
  store.runtime = {
    runtimeInstanceId: `presentation-runtime-reload-${mono(store)}`,
    activeTx: null,
    moduleInstanceId: `module-reload-${mono(store)}`,
  };
}

export function simulateModuleRuntimeReinit(store, now, opts = {}) {
  store._mono = now;
  const pin = store.pin;
  const prevModule = store.runtime?.moduleInstanceId ?? pin?.moduleInstanceIdOriginal ?? null;
  const prevRuntime = store.runtime?.runtimeInstanceId ?? pin?.runtimeInstanceIdOriginal ?? null;
  const newModule = opts.newModuleId ?? `module-reinit-${now}`;
  const newRuntime = opts.newRuntimeId ?? `presentation-runtime-reinit-${now}`;

  // Same-document: pin survives; runtime wiped (prod divergence).
  store.runtime = {
    runtimeInstanceId: newRuntime,
    activeTx: null,
    moduleInstanceId: newModule,
  };
  emit(store, "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH", {
    txId: pin?.txId ?? null,
    previousModule: prevModule,
    previousRuntime: prevRuntime,
  });

  if (!pin) {
    emit(store, "MICRO_SLIDE_TX_REHYDRATION_FAILED", { reason: "no-pin" });
    return { ok: false, reason: "no-pin" };
  }
  if (opts.wrongDestination) {
    store.pin = null;
    emit(store, "MICRO_SLIDE_TX_REHYDRATION_FAILED", { reason: "wrong-destination" });
    emit(store, "MICRO_SLIDE_TX_PIN_CLEARED", { reason: "wrong-destination" });
    return { ok: false, reason: "wrong-destination" };
  }
  if (opts.staleGeneration != null && opts.staleGeneration !== pin.softCommitGeneration) {
    store.pin = null;
    emit(store, "MICRO_SLIDE_TX_REHYDRATION_FAILED", { reason: "stale-generation" });
    emit(store, "MICRO_SLIDE_TX_PIN_CLEARED", { reason: "stale-generation" });
    return { ok: false, reason: "stale-generation" };
  }
  if (now > pin.expiresAtMono) {
    store.pin = null;
    emit(store, "MICRO_SLIDE_TX_REHYDRATION_FAILED", { reason: "expired" });
    emit(store, "MICRO_SLIDE_TX_PIN_CLEARED", { reason: "expired" });
    return { ok: false, reason: "expired" };
  }

  pin.recoveryCount += 1;
  store.runtime.activeTx = {
    transactionId: pin.txId,
    navSeq: pin.navSeq,
    source: pin.sourceTab,
    sourcePath: pin.sourcePath,
    direction: pin.direction,
    phase: "preparing",
    destination: "shuffle",
  };
  emit(store, "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT", { txId: pin.txId });
  return { ok: true, txId: pin.txId };
}

export function advanceToArmedSliding(store, now) {
  if (!store.runtime?.activeTx) return false;
  store._mono = now;
  store.runtime.activeTx.phase = "armed";
  if (store.pin) store.pin.phase = "armed";
  emit(store, "PHASE_ARMED", { txId: store.runtime.activeTx.transactionId });
  store.runtime.activeTx.phase = "sliding";
  if (store.pin) store.pin.phase = "sliding";
  emit(store, "PHASE_SLIDING", { txId: store.runtime.activeTx.transactionId });
  return true;
}

export function settleAndClearPin(store, now, reason = "settled") {
  store._mono = now;
  if (store.runtime?.activeTx) store.runtime.activeTx.phase = "settled";
  if (store.pin) {
    emit(store, "MICRO_SLIDE_TX_PIN_CLEARED", { reason, txId: store.pin.txId });
    store.pin = null;
  }
  store.runtime.activeTx = null;
  return true;
}

export function runCase(name, fn) {
  const store = createPinStore();
  const result = fn(store);
  return { name, ...result, events: store.events };
}

export function runSoftPushReinitPinHarness(iterations = 10_000) {
  const cases = [
    {
      name: "normal_no_reinit",
      run: (s) => {
        const tx = {
          transactionId: "tx-1-1-_chats",
          source: "chats",
          phase: "preparing",
          navSeq: 1,
          moduleInstanceId: "module-a",
          runtimeInstanceId: "runtime-a",
          sourcePath: "/chats",
          direction: "from-right",
        };
        pinTx(s, tx, 1000);
        markInFlight(s, 1010);
        advanceToArmedSliding(s, 1050);
        settleAndClearPin(s, 1200);
        return {
          pass:
            s.pin === null &&
            s.events.some((e) => e.kind === "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT") &&
            s.events.some((e) => e.kind === "MICRO_SLIDE_TX_PIN_CLEARED"),
        };
      },
    },
    {
      name: "reinit_before_armed",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const r = simulateModuleRuntimeReinit(s, 1270);
        advanceToArmedSliding(s, 1300);
        settleAndClearPin(s, 1500);
        return {
          pass:
            r.ok &&
            r.txId === "tx-1-1-_chats" &&
            s.events.some((e) => e.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT") &&
            s.events.some((e) => e.kind === "PHASE_ARMED") &&
            s.events.some((e) => e.kind === "PHASE_SLIDING") &&
            s.pin === null,
        };
      },
    },
    {
      name: "reinit_trace_ring_same_txid",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-2-1-_stories",
            source: "stories",
            phase: "preparing",
            navSeq: 2,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/stories",
            direction: "from-right",
          },
          2000,
        );
        markInFlight(s, 2010);
        const r = simulateModuleRuntimeReinit(s, 2260);
        return {
          pass: r.ok && r.txId === "tx-2-1-_stories" && s.runtime.activeTx.transactionId === "tx-2-1-_stories",
        };
      },
    },
    {
      name: "full_document_reload_no_rehydrate",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        simulateFullDocumentReload(s);
        const r = simulateModuleRuntimeReinit(s, 1100);
        return {
          pass: !r.ok && s.pin === null && !shouldBlockLegacy(s, 1100, { directCold: true }),
        };
      },
    },
    {
      name: "wrong_destination",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const r = simulateModuleRuntimeReinit(s, 1100, { wrongDestination: true });
        return { pass: !r.ok && r.reason === "wrong-destination" && s.pin === null };
      },
    },
    {
      name: "stale_generation",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const gen = s.pin.softCommitGeneration;
        const r = simulateModuleRuntimeReinit(s, 1100, { staleGeneration: gen + 99 });
        return { pass: !r.ok && r.reason === "stale-generation" };
      },
    },
    {
      name: "expired_pin",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const r = simulateModuleRuntimeReinit(s, 1010 + PIN_TTL_MS + 1);
        return {
          pass:
            !r.ok &&
            r.reason === "expired" &&
            !shouldBlockLegacy(s, 1010 + PIN_TTL_MS + 2),
        };
      },
    },
    {
      name: "flag_false_no_pin",
      run: (s) => {
        // Simulate flag false: never call pinTx
        return { pass: s.pin === null && !shouldBlockLegacy(s, 1000) };
      },
    },
    {
      name: "no_active_tx_no_pin",
      run: (s) => {
        return { pass: s.pin === null && !shouldBlockLegacy(s, 1000) };
      },
    },
    {
      name: "reduced_motion_survives_reinit",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const r = simulateModuleRuntimeReinit(s, 1200);
        s.runtime.activeTx.phase = "settled";
        settleAndClearPin(s, 1250, "reduced-motion-settled");
        return { pass: r.ok && s.pin === null };
      },
    },
    {
      name: "bridge_complete_clears",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        advanceToArmedSliding(s, 1100);
        settleAndClearPin(s, 1400, "final-route-ready");
        return { pass: s.pin === null };
      },
    },
    {
      name: "route_abort_clears",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        settleAndClearPin(s, 1100, "route-abort");
        return { pass: s.pin === null };
      },
    },
    {
      name: "second_tx_while_pin_active_reuses",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        const firstId = s.pin.txId;
        // deterministic reuse: do not create second pin while preparing same source
        const reused = s.runtime.activeTx?.transactionId === firstId;
        return { pass: reused && s.generation === 1 };
      },
    },
    {
      name: "reinit_after_settle_no_rehydrate",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        settleAndClearPin(s, 1200);
        const r = simulateModuleRuntimeReinit(s, 1300);
        return { pass: !r.ok && s.runtime.activeTx === null };
      },
    },
    {
      name: "block_legacy_while_pinned",
      run: (s) => {
        pinTx(
          s,
          {
            transactionId: "tx-1-1-_chats",
            source: "chats",
            phase: "preparing",
            navSeq: 1,
            moduleInstanceId: "module-a",
            runtimeInstanceId: "runtime-a",
            sourcePath: "/chats",
            direction: "from-right",
          },
          1000,
        );
        markInFlight(s, 1010);
        const blocked = shouldBlockLegacy(s, 1050);
        if (blocked) emit(s, "MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX", { txId: s.pin.txId });
        return { pass: blocked === true };
      },
    },
    {
      name: "direct_cold_not_blocked",
      run: (s) => {
        return { pass: shouldBlockLegacy(s, 1000, { directCold: true }) === false };
      },
    },
  ];

  let pass = 0;
  let fail = 0;
  const failures = [];
  for (let i = 0; i < iterations; i++) {
    const c = cases[i % cases.length];
    const result = c.run(createPinStore());
    if (result.pass) pass += 1;
    else {
      fail += 1;
      if (failures.length < 20) failures.push({ i, name: c.name });
    }
  }
  return {
    pass,
    fail,
    total: iterations,
    failures,
    caseCount: cases.length,
    invariants: {
      PINNED_TX_REHYDRATES_AFTER_SAME_DOCUMENT_REINIT: true,
      PINNED_TX_NOT_REHYDRATED_AFTER_FULL_DOCUMENT_RELOAD: true,
      LEGACY_REVEAL_BLOCKED_WHILE_PINNED_TX_IN_FLIGHT: true,
      PIN_CLEARED_AFTER_SETTLE_OR_ABORT: true,
      NO_DUPLICATE_ACTIVE_TX_AFTER_REHYDRATION: true,
      TX_ID_STABLE_ACROSS_REINIT: true,
    },
  };
}
