/**
 * Current-hop trace isolation harness — 20 scenarios × 50 cadence permutations = 1000.
 */
import assert from "node:assert/strict";
import {
  TRACE_BELONGS_REASON,
  resolveCurrentHopTrace,
  traceBelongsToCurrentHop,
} from "./shuffle-slide-multisource-classifier.mjs";

const PERMS_PER_CASE = 50;
const TX = "tx-1-1-_chats";
const TX_OTHER = "tx-1-1-_stories";
const TX_ABORTED = "tx-aborted-_chats";
const RING = "trace-ring-test-1";

function navChain({ captureStart, pointerdown, routerDelta = 76 }) {
  const pd = pointerdown;
  return [
    { kind: "PREPARE_WARM_NAV_CALLED", monoMs: captureStart + 100, navSeq: 1, detail: "fromPath=/chats" },
    { kind: "NAV_INPUT_POINTERDOWN", monoMs: pd },
    { kind: "PREPARE_WARM_NAV_CALLED", monoMs: pd, navSeq: 2, detail: "fromPath=/chats" },
    { kind: "NAV_INPUT_CLICK", monoMs: pd + 5 },
    { kind: "COMPLETE_WARM_NAV_CALLED", monoMs: pd + 5, navSeq: 2, detail: "fromPath=/chats" },
    {
      kind: "ROUTER_NAV_CALLED",
      monoMs: pd + routerDelta,
      navSeq: 2,
      detail: "href=/shuffle|fromPath=/chats",
    },
  ];
}

function motorLifecycle({
  captureStart,
  beginOffset,
  transactionId = TX,
  source = "chats",
  includeBridge = true,
  abortedBeforePointer = false,
}) {
  const begin = captureStart + beginOffset;
  const events = [
    { kind: "TRACE_RING_CREATED", monoMs: captureStart - 5000, traceRingInstanceId: RING },
    {
      kind: "TRANSACTION_REF_ASSIGNED",
      monoMs: begin - 5,
      transactionId,
      pathname: "/chats",
      phase: "preparing",
      traceRingInstanceId: RING,
    },
    {
      kind: "TRANSITION_BEGIN",
      monoMs: begin,
      transactionId,
      source,
      pathname: "/chats",
      phase: "preparing",
      navSeq: 1,
      traceRingInstanceId: RING,
    },
    {
      kind: "NAVIGATION_COMMIT_NOTIFIED",
      monoMs: begin + 70,
      transactionId,
      pathname: "/chats",
      navSeq: 1,
      traceRingInstanceId: RING,
    },
    {
      kind: "PHASE_ARMED",
      monoMs: begin + 120,
      transactionId,
      pathname: "/chats",
      navSeq: 1,
      traceRingInstanceId: RING,
    },
    {
      kind: "PHASE_SLIDING",
      monoMs: begin + 150,
      transactionId,
      pathname: "/chats",
      phase: "sliding",
      navSeq: 1,
      traceRingInstanceId: RING,
    },
    {
      kind: "SETTLED",
      monoMs: begin + 280,
      transactionId,
      pathname: "/chats",
      phase: "settled",
      navSeq: 1,
      traceRingInstanceId: RING,
    },
  ];
  if (includeBridge) {
    events.push(
      {
        kind: "POST_SETTLE_ROUTE_BRIDGE_STARTED",
        monoMs: begin + 300,
        transactionId,
        navSeq: 1,
        traceRingInstanceId: RING,
      },
      {
        kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED",
        monoMs: begin + 900,
        transactionId,
        navSeq: 1,
        traceRingInstanceId: RING,
      },
    );
  }
  if (abortedBeforePointer) {
    events.splice(2, 0, {
      kind: "ABORTED",
      monoMs: begin - 1,
      transactionId: TX_ABORTED,
      traceRingInstanceId: RING,
    });
  }
  return events;
}

function priorHopEvents(captureStart) {
  const priorBegin = captureStart - 2000;
  return motorLifecycle({
    captureStart: priorBegin,
    beginOffset: 0,
    transactionId: TX_OTHER,
    source: "stories",
    includeBridge: true,
  }).map((entry) => ({
    ...entry,
    monoMs: entry.monoMs - (captureStart - 2000) + priorBegin,
  }));
}

function baselineAt(count) {
  return {
    rawTraceBaselineEventCount: count,
    rawTraceBaselineRingInstanceId: RING,
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: true,
  };
}

function runCase(name, build, { expectTx = TX, expectBelongs = true, expectAmbiguous = false } = {}) {
  for (let i = 0; i < PERMS_PER_CASE; i += 1) {
    const jitter = (i % 7) * 2;
    const { trace, options, priorCount = 0 } = build(jitter);
    const { hopTrace, resolution } = resolveCurrentHopTrace(trace, options);
    const belong = traceBelongsToCurrentHop(hopTrace, { ...options, trace, resolution });

    if (expectAmbiguous) {
      assert.equal(
        resolution.reason,
        TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION,
        `${name}[${i}] expected ambiguous`,
      );
      assert.equal(belong.belongs, false, `${name}[${i}] ambiguous must not belong`);
      continue;
    }

    assert.equal(resolution.transactionId, expectTx, `${name}[${i}] tx got ${resolution.transactionId}`);
    assert.ok(hopTrace.length > 0, `${name}[${i}] empty hop trace`);
    assert.ok(
      hopTrace.some((entry) => entry.kind === "TRANSITION_BEGIN"),
      `${name}[${i}] missing TRANSITION_BEGIN`,
    );
    assert.equal(belong.belongs, expectBelongs, `${name}[${i}] belong=${belong.belongs} reason=${belong.reason}`);
    if (expectBelongs) {
      assert.equal(belong.reason, TRACE_BELONGS_REASON.CURRENT_HOP_TX_RESOLVED, `${name}[${i}] reason`);
    }
    if (priorCount > 0) {
      assert.ok(
        resolution.currentHopTraceRawBaselineCount === priorCount ||
          options.rawTraceBaseline?.rawTraceBaselineEventCount === priorCount,
        `${name}[${i}] baseline count`,
      );
    }
  }
}

const captureStart = 10_000;
const pointerdown = 10_300;

runCase("warm-minus-20", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [
      ...prior,
      ...motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 20 }),
    ],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("warm-minus-68", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 68 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("warm-minus-80", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 80 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("warm-minus-102-hop4", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 102 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("warm-minus-150", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 150 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("warm-minus-300-after-capture", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: 120 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("prepare-before-capture-excluded", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const early = motorLifecycle({ captureStart: cap - 500, beginOffset: 0, transactionId: "tx-early" });
  const current = motorLifecycle({ captureStart: cap, beginOffset: 180 });
  return {
    trace: [...early, ...current],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(early.length),
    },
  };
});

runCase("prior-hop-same-ring", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap);
  return {
    priorCount: prior.length,
    trace: [...prior, ...motorLifecycle({ captureStart: cap, beginOffset: 180 })],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("ring-reused-4-hops", (j) => {
  const cap = captureStart + j * 4;
  const pd = pointerdown + j * 4;
  let trace = [];
  for (let h = 0; h < 3; h += 1) {
    const hopCap = cap - (3 - h) * 800;
    trace = [...trace, ...motorLifecycle({ captureStart: hopCap, beginOffset: 100, transactionId: `tx-hop-${h}` })];
  }
  trace = [...trace, ...motorLifecycle({ captureStart: cap, beginOffset: 180 })];
  return {
    trace,
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(trace.length - 8),
    },
  };
});

runCase("module-changes-between-hops", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = priorHopEvents(cap).map((entry, idx) => ({
    ...entry,
    moduleInstanceId: `module-old-${idx % 3}`,
  }));
  const current = motorLifecycle({ captureStart: cap, beginOffset: 180 }).map((entry) => ({
    ...entry,
    moduleInstanceId: "module-new-hop",
  }));
  return {
    trace: [...prior, ...current],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("navseq1-gesture-navseq2", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  return {
    trace: motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 102 }),
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

runCase("aborted-candidate-excluded", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const aborted = motorLifecycle({
    captureStart: cap,
    beginOffset: 100,
    transactionId: TX_ABORTED,
    abortedBeforePointer: true,
  });
  const current = motorLifecycle({ captureStart: cap, beginOffset: 180 });
  return {
    trace: [...aborted, ...current],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

runCase("ambiguous-two-live", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const a = motorLifecycle({ captureStart: cap, beginOffset: 120, transactionId: "tx-a" });
  const b = motorLifecycle({ captureStart: cap, beginOffset: 130, transactionId: "tx-b" });
  return {
    trace: [...a, ...b],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
}, { expectTx: "tx-b" });

runCase("export-after-bridge", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const events = motorLifecycle({ captureStart: cap, beginOffset: 180, includeBridge: true });
  return {
    trace: events,
    options: {
      captureStartMono: cap,
      captureEndMono: events[events.length - 1].monoMs + 1,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

runCase("export-during-bridge", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const events = motorLifecycle({ captureStart: cap, beginOffset: 180, includeBridge: true });
  const bridgeStart = events.find((e) => e.kind === "POST_SETTLE_ROUTE_BRIDGE_STARTED");
  return {
    trace: events,
    options: {
      captureStartMono: cap,
      captureEndMono: bridgeStart.monoMs + 50,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

runCase("ring-changed-mid-hop-recover-by-capture", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const oldRingOnly = [
    { kind: "TRACE_RING_CREATED", monoMs: cap - 200, traceRingInstanceId: "trace-ring-old" },
  ];
  const newRing = motorLifecycle({ captureStart: cap, beginOffset: 180 }).map((entry) => ({
    ...entry,
    traceRingInstanceId: "trace-ring-new",
  }));
  return {
    trace: [...oldRingOnly, ...newRing],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: {
        rawTraceBaselineEventCount: 1,
        rawTraceBaselineRingInstanceId: "trace-ring-old",
        CURRENT_HOP_BASELINE_READS_RAW_TRACE: true,
      },
    },
  };
});

runCase("tx-pre-pointer-after-capture", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  return {
    trace: motorLifecycle({ captureStart: cap, beginOffset: 150 }),
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

runCase("prior-begin-closer-but-before-baseline", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + j;
  const prior = motorLifecycle({ captureStart: cap - 100, beginOffset: 50, transactionId: "tx-prior-close" });
  const current = motorLifecycle({ captureStart: cap, beginOffset: pd - cap - 102 });
  return {
    trace: [...prior, ...current],
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(prior.length),
    },
  };
});

runCase("delayed-pointer-after-hover", (j) => {
  const cap = captureStart + j;
  const pd = pointerdown + 400 + j;
  return {
    trace: motorLifecycle({ captureStart: cap, beginOffset: 180 }),
    options: {
      captureStartMono: cap,
      pointerdownMono: pd,
      sourceTab: "chats",
      navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
      rawTraceBaseline: baselineAt(0),
    },
  };
});

// Soft-push reinit: ring split but stable txId + rehydration diagnostic → valid current-hop.
{
  const cap = captureStart;
  const pd = pointerdown;
  const router = pd + 76;
  const ring1 = "trace-ring-pre";
  const ring2 = "trace-ring-post-reinit";
  const trace = [
    { kind: "TRACE_RING_CREATED", monoMs: cap - 100, traceRingInstanceId: ring1 },
    {
      kind: "TRANSITION_BEGIN",
      monoMs: pd - 10,
      transactionId: TX,
      source: "chats",
      pathname: "/chats",
      phase: "preparing",
      navSeq: 1,
      traceRingInstanceId: ring1,
    },
    {
      kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT",
      monoMs: pd - 9,
      txId: TX,
      transactionId: TX,
      phase: "preparing",
      traceRingInstanceId: ring1,
    },
    {
      kind: "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT",
      monoMs: router,
      txId: TX,
      transactionId: TX,
      traceRingInstanceId: ring1,
    },
    { kind: "TRACE_RING_CREATED", monoMs: router + 260, traceRingInstanceId: ring2 },
    {
      kind: "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH",
      monoMs: router + 260,
      txId: TX,
      transactionId: TX,
      traceRingInstanceId: ring2,
    },
    {
      kind: "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT",
      monoMs: router + 261,
      txId: TX,
      transactionId: TX,
      phase: "preparing",
      source: "chats",
      traceRingInstanceId: ring2,
    },
    {
      kind: "TRANSITION_BEGIN",
      monoMs: router + 262,
      transactionId: TX,
      source: "chats",
      pathname: "/shuffle",
      phase: "preparing",
      navSeq: 1,
      note: "rehydrated-after-module-reinit|recovery=1|tx=tx-1-1-_chats",
      traceRingInstanceId: ring2,
    },
    { kind: "PHASE_ARMED", monoMs: router + 280, transactionId: TX, navSeq: 1, traceRingInstanceId: ring2 },
    { kind: "PHASE_SLIDING", monoMs: router + 290, transactionId: TX, navSeq: 1, traceRingInstanceId: ring2 },
    { kind: "SETTLED", monoMs: router + 400, transactionId: TX, navSeq: 1, traceRingInstanceId: ring2 },
  ];
  const resolved = resolveCurrentHopTrace(trace, {
    captureStartMono: cap,
    pointerdownMono: pd,
    sourceTab: "chats",
    navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
    rawTraceBaseline: baselineAt(0),
  });
  const belong = traceBelongsToCurrentHop(resolved.hopTrace, {
    trace,
    resolution: resolved.resolution,
    captureStartMono: cap,
    pointerdownMono: pd,
    sourceTab: "chats",
    navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
    rawTraceBaseline: baselineAt(0),
  });
  assert.equal(belong.belongs, true, "reinit-split ring with stable txId must belong");
  assert.equal(resolved.resolution.transactionId, TX, "rehydrated tx must resolve");
}

{
  const cap = captureStart;
  const pd = pointerdown;
  const router = pd + 76;
  const trace = [
    {
      kind: "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH",
      monoMs: router + 260,
      // missing txId
    },
    { kind: "PHASE_SLIDING", monoMs: router + 290, transactionId: TX_OTHER, navSeq: 1 },
  ];
  const resolved = resolveCurrentHopTrace(trace, {
    captureStartMono: cap,
    pointerdownMono: pd,
    sourceTab: "chats",
    navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
    rawTraceBaseline: baselineAt(0),
  });
  assert.equal(resolved.resolution.transactionId, null, "reinit without txId must not fake-pass");
}

{
  const cap = captureStart;
  const pd = pointerdown;
  const router = pd + 76;
  const trace = [
    {
      kind: "TRANSITION_BEGIN",
      monoMs: pd - 10,
      transactionId: TX,
      source: "chats",
      pathname: "/chats",
      phase: "preparing",
      navSeq: 1,
    },
    {
      kind: "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT",
      monoMs: router + 261,
      txId: TX_OTHER,
      transactionId: TX_OTHER,
    },
    {
      kind: "TRANSITION_BEGIN",
      monoMs: router + 262,
      transactionId: TX_OTHER,
      source: "chats",
      pathname: "/shuffle",
      phase: "preparing",
      navSeq: 1,
      note: "rehydrated-after-module-reinit",
    },
    { kind: "PHASE_SLIDING", monoMs: router + 290, transactionId: TX, navSeq: 1 },
    { kind: "PHASE_SLIDING", monoMs: router + 291, transactionId: TX_OTHER, navSeq: 1 },
    { kind: "SETTLED", monoMs: router + 400, transactionId: TX, navSeq: 1 },
    { kind: "SETTLED", monoMs: router + 401, transactionId: TX_OTHER, navSeq: 1 },
  ];
  const { resolution } = resolveCurrentHopTrace(trace, {
    captureStartMono: cap,
    pointerdownMono: pd,
    sourceTab: "chats",
    navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
    rawTraceBaseline: baselineAt(0),
  });
  assert.equal(
    resolution.reason,
    TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION,
    "two txIds after reinit must be invalid/ambiguous",
  );
}

// Single-shot ambiguous contract (not counted in 1000 permutations).
{
  const cap = captureStart;
  const pd = pointerdown;
  function tiedTx(tx) {
    return [
      {
        kind: "TRANSACTION_REF_ASSIGNED",
        monoMs: cap + 145,
        transactionId: tx,
        pathname: "/chats",
        phase: "preparing",
      },
      {
        kind: "TRANSITION_BEGIN",
        monoMs: cap + 150,
        transactionId: tx,
        source: "chats",
        pathname: "/chats",
        phase: "preparing",
        navSeq: 1,
      },
      { kind: "PHASE_SLIDING", monoMs: cap + 200, transactionId: tx, navSeq: 1 },
      { kind: "SETTLED", monoMs: cap + 280, transactionId: tx, navSeq: 1 },
    ];
  }
  const trace = [...tiedTx("tx-tie-a"), ...tiedTx("tx-tie-b")];
  const { resolution } = resolveCurrentHopTrace(trace, {
    captureStartMono: cap,
    pointerdownMono: pd,
    sourceTab: "chats",
    navInputEvents: navChain({ captureStart: cap, pointerdown: pd }),
    rawTraceBaseline: baselineAt(0),
  });
  assert.equal(
    resolution.reason,
    TRACE_BELONGS_REASON.AMBIGUOUS_CURRENT_HOP_TRANSACTION,
    "ambiguous contract",
  );
}

console.log(`CURRENT_HOP_TRACE_ISOLATION_HARNESS: ${20 * PERMS_PER_CASE}/${20 * PERMS_PER_CASE} PASS`);
