/**
 * Local dry-runs for trace-archive softnav observability (NO prod, NO 20/20).
 */
import fs from "node:fs";
import path from "node:path";
import {
  LABEL,
  OUTCOME,
  preferNonEmptyTrace,
  resolveSoftNavAwareCurrentHop,
} from "./softnav-tx-trace-observability.mjs";

const OUT = path.join(
  "scripts",
  "ghost-filmstrip-out",
  `local-trace-archive-softnav-tx-observability-dryruns-${Date.now()}`,
);
fs.mkdirSync(OUT, { recursive: true });

function write(name, data) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

const soft = [
  {
    monoMs: 1000,
    kind: "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED",
    transactionId: "tx-1-1-_chats",
    phase: "preparing",
    sourceTab: "chats",
    href: "/shuffle",
  },
  {
    monoMs: 1005,
    kind: "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED",
    transactionId: "tx-1-1-_chats",
    phase: "preparing",
    sourceTab: "chats",
    href: "/shuffle",
  },
];

const runtime = [
  { kind: "TRACE_RING_CREATED", monoMs: 1280 },
  { kind: "PRESENTATION_RUNTIME_CREATED", monoMs: 1281 },
  { kind: "LEGACY_REVEAL_EXECUTED", monoMs: 1290, transactionId: null },
];

const withArchive = resolveSoftNavAwareCurrentHop({
  mainTraceCurrent: [],
  softNavDiag: soft,
  traceArchive: {
    byTxId: {
      "tx-1-1-_chats": {
        txId: "tx-1-1-_chats",
        events: [
          { kind: "TRANSITION_BEGIN", monoMs: 990, transactionId: "tx-1-1-_chats" },
          { kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET", monoMs: 1275, transactionId: "tx-1-1-_chats" },
        ],
      },
    },
    events: [
      { kind: "TRANSITION_BEGIN", monoMs: 990, transactionId: "tx-1-1-_chats" },
      { kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET", monoMs: 1275, transactionId: "tx-1-1-_chats" },
    ],
  },
  runtimeLifecycle: runtime,
  pinDiagCaptured: false,
});

const withoutArchive = resolveSoftNavAwareCurrentHop({
  mainTraceCurrent: [],
  softNavDiag: soft,
  runtimeLifecycle: runtime,
  pinDiagCaptured: false,
});

const mergePreserve = preferNonEmptyTrace(
  [{ kind: "TRANSITION_BEGIN", monoMs: 1, transactionId: "tx-1" }],
  [],
);

const withoutPin = resolveSoftNavAwareCurrentHop({
  mainTraceCurrent: [],
  softNavDiag: soft,
  pinDiag: { exportAvailable: true, pinHistory: [], activePin: null, byTxId: {} },
  pinDiagCaptured: true,
});

const a = write("SIMULATED_TRACE_RESET_AFTER_SOFTNAV_TX_archive_on.json", {
  name: "SIMULATED_TRACE_RESET_AFTER_SOFTNAV_TX",
  archive: "ON",
  result: withArchive,
  expected: {
    currentHopSoftNavTxId: "tx-1-1-_chats",
    notTxNull: true,
    notClean: true,
    classifiedTraceReset: true,
  },
  checks: {
    currentHopSoftNavTxId: withArchive.currentHopSoftNavTxId,
    notTxNull: withArchive.transactionId != null,
    notClean: withArchive.cleanEligible === false,
    outcome: withArchive.outcome,
    labels: withArchive.labels,
  },
});

const b = write("SIMULATED_TRACE_RESET_AFTER_SOFTNAV_TX_archive_off.json", {
  name: "SIMULATED_TRACE_RESET_AFTER_SOFTNAV_TX",
  archive: "OFF",
  result: withoutArchive,
  expected: {
    outcomeFamily: "SOFTNAV_TX_ONLY_OR_RESET",
    notTxNull: true,
    notClean: true,
  },
  checks: {
    currentHopSoftNavTxId: withoutArchive.currentHopSoftNavTxId,
    notTxNull: withoutArchive.transactionId != null,
    notClean: withoutArchive.cleanEligible === false,
    outcome: withoutArchive.outcome,
  },
});

const c = write("SIMULATED_NONEMPTY_TRACE_THEN_EMPTY_MERGE.json", {
  result: mergePreserve,
  NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY:
    mergePreserve.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY,
});

const d = write("SIMULATED_SOFTNAV_TX_WITHOUT_PIN.json", {
  result: withoutPin,
  expectedLabel: LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT,
  hasLabel: withoutPin.labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT),
});

write("dryrun-summary.json", {
  outDir: OUT,
  SIMULATED_TRACE_RESET_with_archive: a,
  SIMULATED_TRACE_RESET_without_archive: b,
  SIMULATED_NONEMPTY_THEN_EMPTY: c,
  SIMULATED_SOFTNAV_WITHOUT_PIN: d,
  withArchiveOutcome: withArchive.outcome,
  withoutArchiveOutcome: withoutArchive.outcome,
  withoutPinLabels: withoutPin.labels,
  OUTCOME,
});

console.log(JSON.stringify({ OUT, withArchive: withArchive.outcome, withoutArchive: withoutArchive.outcome }, null, 2));
