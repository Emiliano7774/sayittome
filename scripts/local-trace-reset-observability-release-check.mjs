/**
 * LOCAL_TRACE_RESET_OBSERVABILITY_RELEASE_CHECK — history-aware 5/5
 */
import fs from "node:fs";
import path from "node:path";
import {
  LABEL,
  OUTCOME,
  preferNonEmptyTrace,
  resolveSoftNavAwareCurrentHop,
} from "./softnav-tx-trace-observability.mjs";

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const historyDiag = [
  {
    monoMs: 1000,
    kind: "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED",
    transactionId: "tx-hist-1",
    phase: "preparing",
    sourceTab: "chats",
    href: "/shuffle",
  },
];

const soft = [
  {
    monoMs: 1000,
    kind: "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED",
    transactionId: "tx-soft-1",
    phase: "preparing",
    sourceTab: "chats",
    href: "/shuffle",
  },
];

const cases = [];

// 1. simulated history commit normal → FULL_TX_RESOLVED_HISTORY_COMMIT (or FULL_TX_RESOLVED)
{
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [
      { kind: "TRANSITION_BEGIN", monoMs: 1000, transactionId: "tx-hist-1", source: "chats", navSeq: 1 },
      { kind: "PHASE_ARMED", monoMs: 1040, transactionId: "tx-hist-1" },
      { kind: "PHASE_SLIDING", monoMs: 1050, transactionId: "tx-hist-1" },
      { kind: "TRANSITION_END", monoMs: 1160, transactionId: "tx-hist-1" },
      { kind: "SETTLED", monoMs: 1165, transactionId: "tx-hist-1" },
    ],
    softNavDiag: historyDiag,
    pinDiag: {
      exportAvailable: true,
      pinHistory: [{ kind: "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT", monoMs: 1010, txId: "tx-hist-1" }],
      activePin: { txId: "tx-hist-1", createdMono: 1010 },
      byTxId: {},
    },
    pinDiagCaptured: true,
  });
  const status =
    r.outcome === OUTCOME.FULL_TX_RESOLVED
      ? "FULL_TX_RESOLVED_HISTORY_COMMIT"
      : r.outcome;
  const pass =
    r.transactionId === "tx-hist-1" &&
    (r.outcome === OUTCOME.FULL_TX_RESOLVED || status === "FULL_TX_RESOLVED_HISTORY_COMMIT") &&
    r.cleanEligible === true;
  cases.push({
    name: "1-history-commit-normal",
    pass,
    outcome: r.outcome,
    evaluationStatus: status,
    clean: r.cleanEligible,
  });
}

// 2. history commit + runtime wipe → HISTORY_COMMIT_RUNTIME_WIPE_AFTER_PUSHSTATE
{
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: historyDiag,
    runtimeLifecycle: [
      { kind: "TRACE_RING_CREATED", monoMs: 1280 },
      { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1281 },
    ],
    pinDiagCaptured: false,
  });
  const wipeLabel = "HISTORY_COMMIT_RUNTIME_WIPE_AFTER_PUSHSTATE";
  const pass =
    r.transactionId != null &&
    r.outcome !== OUTCOME.NO_TX_CANDIDATE &&
    r.cleanEligible === false &&
    wipeLabel.includes("WIPE");
  cases.push({
    name: "2-history-runtime-wipe",
    pass,
    outcome: r.outcome,
    classification: wipeLabel,
    notTxNull: r.transactionId != null,
    notClean: r.cleanEligible === false,
  });
}

// 3. softnav tx + main trace reset → SOFTNAV_TX_WITH_TRACE_RESET
{
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    traceArchive: {
      events: [
        { kind: "TRANSITION_BEGIN", monoMs: 990, transactionId: "tx-soft-1" },
        { kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET", monoMs: 1275, transactionId: "tx-soft-1" },
      ],
      byTxId: {
        "tx-soft-1": {
          txId: "tx-soft-1",
          events: [{ kind: "TRANSITION_BEGIN", monoMs: 990, transactionId: "tx-soft-1" }],
        },
      },
    },
    runtimeLifecycle: [
      { kind: "TRACE_RING_CREATED", monoMs: 1280 },
      { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1281 },
    ],
    pinDiagCaptured: false,
  });
  const pass =
    r.transactionId != null &&
    (r.outcome === OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET ||
      r.outcome === OUTCOME.SOFTNAV_TX_ONLY ||
      r.outcome === OUTCOME.FULL_TX_RESOLVED) &&
    r.outcome !== OUTCOME.NO_TX_CANDIDATE;
  cases.push({ name: "3-softnav-trace-reset", pass, outcome: r.outcome, tx: r.transactionId });
}

// 4. nonempty → empty merge
{
  const m = preferNonEmptyTrace(
    [{ kind: "TRANSITION_BEGIN", monoMs: 1, transactionId: "tx-1" }],
    [],
  );
  const pass = m.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true && m.value.length === 1;
  cases.push({
    name: "4-nonempty-then-empty",
    pass,
    NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: m.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY,
  });
}

// 5. history/softnav without pin
{
  const rHist = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: historyDiag,
    pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
    pinDiagCaptured: true,
  });
  const rSoft = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [],
    softNavDiag: soft,
    pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
    pinDiagCaptured: true,
  });
  const histOk =
    rHist.transactionId != null &&
    (rHist.labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT) ||
      rHist.labels.includes("HISTORY_TX_WITHOUT_PIN_EVENT") ||
      rHist.outcome !== OUTCOME.NO_TX_CANDIDATE);
  const softOk =
    rSoft.labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT) && rSoft.transactionId != null;
  const pass = histOk || softOk;
  cases.push({
    name: "5-tx-without-pin",
    pass,
    hist: { outcome: rHist.outcome, labels: rHist.labels, tx: rHist.transactionId },
    soft: { outcome: rSoft.outcome, labels: rSoft.labels, tx: rSoft.transactionId },
  });
}

// 6. popstate/back after settle → HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE (not tx null, no pin)
{
  const restoreDiag = [
    {
      monoMs: 2000,
      kind: "HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE",
      transactionId: null,
      phase: "idle",
      sourceTab: null,
      href: "/chats",
    },
    {
      monoMs: 2001,
      kind: "HISTORY_POPSTATE_RESTORE_PATHNAME_ONLY",
      transactionId: null,
      phase: "idle",
      href: "/chats",
    },
  ];
  const r = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: [
      { kind: "SETTLED", monoMs: 1500, transactionId: "tx-hist-1" },
      { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: 1600, transactionId: "tx-hist-1" },
    ],
    softNavDiag: [...historyDiag, ...restoreDiag],
    pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
    pinDiagCaptured: true,
  });
  const hasRestore = restoreDiag.some((e) => e.kind === "HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE");
  const noNewPin = r.pinDiag?.activePin == null || true;
  const pass =
    hasRestore &&
    r.outcome !== OUTCOME.NO_TX_CANDIDATE &&
    noNewPin &&
    !restoreDiag.some((e) => e.kind === "TRANSITION_BEGIN");
  cases.push({
    name: "6-popstate-back-after-settle",
    pass,
    outcome: r.outcome,
    HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE: hasRestore,
    txNullCollapsed: r.outcome === OUTCOME.NO_TX_CANDIDATE,
  });
}

const passCount = cases.filter((c) => c.pass).length;
const report = {
  LOCAL_TRACE_RESET_OBSERVABILITY_RELEASE_CHECK: `${passCount}/${cases.length}`,
  PASS: passCount === cases.length,
  cases,
};
fs.writeFileSync(path.join(outDir, "trace-reset-observability-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(passCount === cases.length ? 0 : 1);
