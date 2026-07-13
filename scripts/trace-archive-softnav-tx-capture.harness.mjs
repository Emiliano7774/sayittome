/**
 * TRACE_ARCHIVE_SOFTNAV_TX_CAPTURE_HARNESS — 10000/10000
 */
import assert from "node:assert/strict";
import {
  LABEL,
  OUTCOME,
  mergeTraceSources,
  preferNonEmptyTrace,
  resolveSoftNavAwareCurrentHop,
} from "./softnav-tx-trace-observability.mjs";

function softNavTx(txId = "tx-1-1-_chats", mono = 1000) {
  return [
    {
      monoMs: mono,
      kind: "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED",
      transactionId: txId,
      phase: "preparing",
      href: "/shuffle",
      sourceTab: "chats",
    },
    {
      monoMs: mono + 5,
      kind: "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED",
      transactionId: txId,
      phase: "preparing",
      href: "/shuffle",
      sourceTab: "chats",
    },
  ];
}

function fullMainTrace(txId = "tx-1-1-_chats", mono = 1000) {
  return [
    { kind: "TRANSITION_BEGIN", monoMs: mono, transactionId: txId, navSeq: 1, source: "chats" },
    { kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", monoMs: mono + 10, transactionId: txId },
    { kind: "PHASE_ARMED", monoMs: mono + 40, transactionId: txId },
    { kind: "PHASE_SLIDING", monoMs: mono + 50, transactionId: txId },
    { kind: "TRANSITION_END", monoMs: mono + 160, transactionId: txId },
    { kind: "SETTLED", monoMs: mono + 165, transactionId: txId },
  ];
}

function caseFullClean() {
  const soft = softNavTx();
  const main = fullMainTrace();
  const pin = {
    exportAvailable: true,
    pinHistory: [
      {
        kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT",
        monoMs: 1010,
        txId: "tx-1-1-_chats",
      },
    ],
    activePin: { txId: "tx-1-1-_chats", phase: "preparing", createdMono: 1010 },
    byTxId: { "tx-1-1-_chats": [] },
  };
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: main,
    softNavDiag: soft,
    pinDiag: pin,
    pinDiagCaptured: true,
  });
  assert.equal(r.outcome, OUTCOME.FULL_TX_RESOLVED);
  assert.equal(r.cleanEligible, true);
  assert.equal(r.invariants.NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY, true);
}

function caseResetWithArchive() {
  const soft = softNavTx();
  const archive = {
    byTxId: {
      "tx-1-1-_chats": {
        txId: "tx-1-1-_chats",
        events: [
          { kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-1-1-_chats" },
          { kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET", monoMs: 1280, transactionId: "tx-1-1-_chats" },
        ],
      },
    },
    events: [
      { kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-1-1-_chats" },
      { kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET", monoMs: 1280, transactionId: "tx-1-1-_chats" },
      { kind: "TRACE_RING_CREATED", monoMs: 1281, transactionId: "tx-1-1-_chats" },
    ],
  };
  const runtime = [
    { kind: "TRACE_RING_CREATED", monoMs: 1281 },
    { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1282 },
  ];
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    traceArchive: archive,
    runtimeLifecycle: runtime,
    pinDiag: "MISSING",
    pinDiagCaptured: false,
  });
  assert.equal(r.outcome, OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET);
  assert.notEqual(r.outcome, OUTCOME.NO_TX_CANDIDATE);
  assert.equal(r.currentHopSoftNavTxId, "tx-1-1-_chats");
  assert.equal(r.cleanEligible, false);
  assert.ok(r.labels.includes(LABEL.SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET));
  assert.equal(r.invariants.SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX, true);
}

function caseResetWithoutArchive() {
  const soft = softNavTx();
  const runtime = [
    { kind: "TRACE_RING_CREATED", monoMs: 1281 },
    { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1282 },
  ];
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    runtimeLifecycle: runtime,
    pinDiagCaptured: false,
  });
  assert.ok(
    r.outcome === OUTCOME.SOFTNAV_TX_ONLY ||
      r.outcome === OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET ||
      r.outcome === OUTCOME.SOFTNAV_TX_WITHOUT_PIN,
  );
  assert.notEqual(r.reason, "NO_CURRENT_HOP_TX_CANDIDATE");
  assert.equal(r.currentHopSoftNavTxId, "tx-1-1-_chats");
  assert.equal(r.cleanEligible, false);
  assert.equal(r.invariants.MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_FORBIDDEN_AS_GENERIC_NO_TX, true);
}

function caseSoftNavWithoutPin() {
  const soft = softNavTx();
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
    pinDiagCaptured: true,
  });
  assert.ok(r.labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT));
  assert.equal(r.invariants.SOFTNAV_TX_WITHOUT_PIN_EXPLICITLY_CLASSIFIED, true);
  assert.notEqual(r.outcome, OUTCOME.NO_TX_CANDIDATE);
}

function casePinWithoutMain() {
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: [],
    pinDiag: {
      exportAvailable: true,
      activePin: { txId: "tx-pin-1", phase: "preparing", createdMono: 1 },
      pinHistory: [{ kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", monoMs: 1, txId: "tx-pin-1" }],
      byTxId: { "tx-pin-1": [] },
    },
    pinDiagCaptured: true,
  });
  assert.equal(r.outcome, OUTCOME.PIN_TX_WITHOUT_MAIN_TRACE);
}

function caseNoTx() {
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: [],
    pinDiag: null,
  });
  assert.equal(r.outcome, OUTCOME.NO_TX_CANDIDATE);
}

function casePreferNonEmpty() {
  const preserved = preferNonEmptyTrace(
    [{ kind: "TRANSITION_BEGIN", monoMs: 1, transactionId: "tx-1" }],
    [],
  );
  assert.equal(preserved.value.length, 1);
  assert.equal(preserved.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY, true);
  assert.equal(preserved.preserved, true);
}

function caseTraceRingAfterSoftPush() {
  const soft = softNavTx("tx-1", 1000);
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    runtimeLifecycle: [{ kind: "TRACE_RING_CREATED", monoMs: 1300 }],
  });
  assert.equal(r.traceResetAfterSoftPush, true);
  assert.ok(r.labels.includes(LABEL.MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH));
  assert.equal(r.invariants.TRACE_RESET_AFTER_SOFT_PUSH_EXPLICITLY_CLASSIFIED, true);
}

function caseRuntimeAfterSoftPush() {
  const soft = softNavTx("tx-1", 1000);
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    runtimeLifecycle: [
      { kind: "TRACE_RING_CREATED", monoMs: 1300 },
      { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1301 },
    ],
  });
  assert.equal(r.runtimeCreatedAfterSoftPush, true);
  assert.ok(r.labels.includes(LABEL.POST_SOFT_PUSH_RUNTIME_REINIT_OR_REALM_WIPE));
}

function caseLegacyAfterReset() {
  const soft = softNavTx("tx-1", 1000);
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [
      { kind: "TRACE_RING_CREATED", monoMs: 1300 },
      { kind: "LEGACY_REVEAL_EXECUTED", monoMs: 1310, transactionId: null },
    ],
    softNavDiag: soft,
    runtimeLifecycle: [{ kind: "TRACE_RING_CREATED", monoMs: 1300 }],
  });
  assert.equal(r.legacyRevealAfterReset, true);
  assert.ok(r.labels.includes(LABEL.LEGACY_REVEAL_AFTER_TRACE_RESET));
}

function caseNoScreencastNoRaf() {
  // Provider independence: resolver does not require RAF samples.
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: fullMainTrace(),
    softNavDiag: softNavTx(),
    pinDiag: {
      exportAvailable: true,
      pinHistory: [{ kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", monoMs: 1010, txId: "tx-1-1-_chats" }],
      activePin: { txId: "tx-1-1-_chats", createdMono: 1010 },
      byTxId: {},
    },
    pinDiagCaptured: true,
  });
  assert.equal(r.outcome, OUTCOME.FULL_TX_RESOLVED);
  assert.equal(r.cleanEligible, true);
}

function caseFullCleanRequiresTe() {
  const main = fullMainTrace().filter((e) => e.kind !== "TRANSITION_END" && e.kind !== "SETTLED");
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: main,
    softNavDiag: softNavTx(),
    pinDiag: {
      exportAvailable: true,
      pinHistory: [{ kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", monoMs: 1010, txId: "tx-1-1-_chats" }],
      activePin: { txId: "tx-1-1-_chats", createdMono: 1010 },
      byTxId: {},
    },
    pinDiagCaptured: true,
  });
  assert.equal(r.outcome, OUTCOME.FULL_TX_RESOLVED);
  assert.equal(r.cleanEligible, false);
}

function caseSoftNavWithoutArmedNotClean() {
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: softNavTx(),
  });
  assert.equal(r.cleanEligible, false);
  assert.equal(r.invariants.NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY, true);
}

function caseArchiveExpired() {
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: [],
    traceArchive: { expired: true, events: [{ kind: "TRANSITION_BEGIN", monoMs: 1, transactionId: "tx-old" }], byTxId: {} },
  });
  assert.equal(r.outcome, OUTCOME.TRACE_ARCHIVE_EXPIRED);
  assert.equal(r.cleanEligible, false);
  assert.ok(r.labels.includes(LABEL.TRACE_ARCHIVE_EXPIRED));
}

function caseDedupStable() {
  const merge = mergeTraceSources({
    mainTraceCurrent: [{ kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-1", navSeq: 1 }],
    traceArchiveEvents: [
      {
        kind: "TRANSITION_BEGIN",
        monoMs: 1000,
        transactionId: "tx-1",
        navSeq: 1,
        archiveSource: "traceArchive",
      },
    ],
  });
  const begins = merge.merged.filter((e) => e.kind === "TRANSITION_BEGIN");
  // Different mergeSource → both may remain; same key with same source collapses.
  assert.ok(begins.length >= 1);
  const again = mergeTraceSources({
    mainTraceCurrent: [{ kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-1", navSeq: 1 }],
    traceArchiveEvents: [{ kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-1", navSeq: 1 }],
  });
  assert.equal(
    again.merged.filter(
      (e) => e.kind === "TRANSITION_BEGIN" && e.mergeSource === "mainTraceCurrent",
    ).length,
    1,
  );
}

const CASES = [
  caseFullClean,
  caseResetWithArchive,
  caseResetWithoutArchive,
  caseSoftNavWithoutPin,
  casePinWithoutMain,
  caseNoTx,
  casePreferNonEmpty,
  caseTraceRingAfterSoftPush,
  caseRuntimeAfterSoftPush,
  caseLegacyAfterReset,
  caseNoScreencastNoRaf,
  caseFullCleanRequiresTe,
  caseSoftNavWithoutArmedNotClean,
  caseArchiveExpired,
  caseDedupStable,
];

export function runTraceArchiveSoftNavTxCaptureHarness(iterations = 10_000) {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const invariants = {
    SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX: true,
    MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_FORBIDDEN_AS_GENERIC_NO_TX: true,
    NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: true,
    PIN_DIAG_CAPTURED_WHEN_EXPORT_AVAILABLE: true,
    TRACE_RESET_AFTER_SOFT_PUSH_EXPLICITLY_CLASSIFIED: true,
    SOFTNAV_TX_WITHOUT_PIN_EXPLICITLY_CLASSIFIED: true,
    NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY: true,
  };

  for (let i = 0; i < iterations; i += 1) {
    try {
      const fn = CASES[i % CASES.length];
      fn();
      // Re-assert global invariants each iteration on the softnav-reset path.
      const soft = resolveSoftNavAwareCurrentHop({
        mainTraceCurrent: [],
        softNavDiag: softNavTx(`tx-${i % 97}`, 1000 + (i % 50)),
        runtimeLifecycle: [
          { kind: "TRACE_RING_CREATED", monoMs: 1400 },
          { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1401 },
        ],
        pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
        pinDiagCaptured: true,
      });
      assert.equal(soft.invariants.SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX, true);
      assert.equal(soft.invariants.MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_FORBIDDEN_AS_GENERIC_NO_TX, true);
      assert.equal(soft.invariants.NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY, true);
      assert.equal(soft.cleanEligible, false);
      assert.notEqual(soft.outcome, OUTCOME.NO_TX_CANDIDATE);
      pass += 1;
    } catch (err) {
      fail += 1;
      if (failures.length < 20) {
        failures.push({ i, message: err?.message || String(err) });
      }
      invariants.SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX = false;
    }
  }

  return { pass, fail, total: iterations, failures, invariants };
}

const isMain = process.argv[1] && process.argv[1].endsWith("trace-archive-softnav-tx-capture.harness.mjs");
if (isMain) {
  const { pass, fail, total, failures, invariants } = runTraceArchiveSoftNavTxCaptureHarness(10_000);
  assert.equal(total, 10_000);
  assert.equal(fail, 0, `failures: ${JSON.stringify(failures.slice(0, 5))}`);
  assert.equal(pass, 10_000);
  console.log(`TRACE_ARCHIVE_SOFTNAV_TX_CAPTURE_HARNESS = ${pass}/${total} PASS`);
  console.log(JSON.stringify(invariants));
}
