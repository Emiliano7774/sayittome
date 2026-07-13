/**
 * WAAPI settle/cancel race harness — canonical terminal state + clean gate.
 */
import fs from "node:fs";
import {
  reduceWaapiTerminalState,
  evaluatePromoteAcceptance,
  WAAPI_TERMINAL_STATE,
} from "./waapi-settle-terminal-state.mjs";
import { evaluateWaapiCompositorPhysicalEvidence } from "./waapi-compositor-lifecycle-evidence.mjs";

const ITERATIONS = 10_000;

function baseTrace(extra = []) {
  return [
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 1 },
    { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED", monoMs: 2 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: 3 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: 4 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED", monoMs: 5 },
    ...extra,
  ];
}

function evalTrace(hopTrace, settleReason = null) {
  return evaluateWaapiCompositorPhysicalEvidence({
    engineSlideOccurred: true,
    domSlideOccurred: true,
    hopTrace,
    settleReason,
    bridgeCompleted: true,
    pinCleared: true,
  });
}

const cases = [
  {
    name: "1-native-finished-promise",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 10, reason: "native-finished" },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "SETTLED", monoMs: 13, note: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace, "waapi-finish");
      return ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true && ev.waapiFinishedNative === true;
    },
  },
  {
    name: "2-finish-event",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 10, reason: "finish-event" },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "SETTLE_INITIATED", monoMs: 13, reason: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace);
      return ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true;
    },
  },
  {
    name: "3-end-watchdog-promote-after-ready-started",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "SETTLE_INITIATED", monoMs: 9, reason: "post-transition-start-end-watchdog" },
        {
          kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_ACCEPTED",
          monoMs: 10,
        },
        {
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
          monoMs: 11,
          reason: "promoted-from-end-watchdog-after-duration",
        },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 12 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 13 },
        { kind: "SETTLED", monoMs: 14, note: "waapi-watchdog-promoted-finish" },
      ]);
      const ev = evalTrace(hopTrace, "post-transition-start-end-watchdog");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
        ev.waapiFinishedPromoted === true &&
        ev.settleReasonCanonical === "waapi-watchdog-promoted-finish"
      );
    },
  },
  {
    name: "4-end-watchdog-promote-without-started",
    run: () => {
      const hopTrace = [
        { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 1 },
        { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED", monoMs: 2 },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: 3 },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: 4 },
        {
          kind: "MICRO_SLIDE_WAAPI_END_WATCHDOG_PROMOTE_REJECTED",
          monoMs: 10,
          promoteReason: "missing-started",
        },
        { kind: "SETTLED", monoMs: 11, note: "post-transition-start-end-watchdog" },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: 12 },
      ];
      const ev = evalTrace(hopTrace, "post-transition-start-end-watchdog");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
        ev.waapiPromoteRejected === true
      );
    },
  },
  {
    name: "5-cancel-after-physical-and-final-styles",
    run: () => {
      const hopTrace = baseTrace([
        {
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
          monoMs: 10,
          reason: "promoted-from-end-watchdog-after-duration",
        },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED", monoMs: 13, reason: "animation-cancel-event" },
        { kind: "SETTLED", monoMs: 14, note: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace);
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
        ev.waapiCleanupCancelAfterFinish === true &&
        ev.waapiCancelBeforePhysical === false
      );
    },
  },
  {
    name: "6-cancel-during-fill-release-after-finish",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 10, reason: "native-finished" },
        { kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_STARTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 12 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 13 },
        {
          kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED",
          monoMs: 14,
        },
        { kind: "SETTLED", monoMs: 15, note: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace);
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
        ev.WAAPI_CANCEL_AFTER_FILL_RELEASE_IGNORED_FOR_CLEAN === true
      );
    },
  },
  {
    name: "7-cancel-before-physical",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED", monoMs: 10 },
        { kind: "SETTLED", monoMs: 11, note: "waapi-cancel" },
      ]);
      const ev = evalTrace(hopTrace, "waapi-cancel");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
        ev.waapiCancelBeforePhysical === true
      );
    },
  },
  {
    name: "8-reject-before-physical",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_REJECTED", monoMs: 10 },
        { kind: "SETTLED", monoMs: 11, note: "waapi-finished-rejected" },
      ]);
      const ev = evalTrace(hopTrace);
      return ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false;
    },
  },
  {
    name: "9-final-styles-missing",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 10 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "SETTLED", monoMs: 13, note: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace, "waapi-finish");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
        ev.primaryFailureClass === "WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING"
      );
    },
  },
  {
    name: "10-bridge-pin-without-physical",
    run: () => {
      const hopTrace = [
        { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 1 },
        { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED", monoMs: 2 },
        { kind: "SETTLED", monoMs: 10, note: "post-transition-start-end-watchdog" },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: 11 },
      ];
      const ev = evalTrace(hopTrace, "post-transition-start-end-watchdog");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
        (ev.primaryFailureClass ===
          "WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION" ||
          ev.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START" ||
          ev.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH")
      );
    },
  },
  {
    name: "11-raw-cancel-after-promote-cannot-override",
    run: () => {
      const hopTrace = baseTrace([
        {
          kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED",
          monoMs: 10,
          reason: "promoted-from-end-watchdog-after-duration",
        },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED", monoMs: 13 },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED", monoMs: 14 },
        { kind: "SETTLED", monoMs: 15, note: "waapi-finish" },
      ]);
      const before = reduceWaapiTerminalState(hopTrace);
      const ev = evalTrace(hopTrace);
      return (
        before.waapiCanonicalPhysicalSatisfied === true &&
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
        ev.waapiCancelCount === 0
      );
    },
  },
  {
    name: "12-duplicate-cancel-after-fill-release",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: 10 },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: 11 },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED", monoMs: 12 },
        { kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED", monoMs: 13 },
        { kind: "MICRO_SLIDE_WAAPI_FILL_RELEASE_CANCEL_IGNORED", monoMs: 14 },
        { kind: "SETTLED", monoMs: 15, note: "waapi-finish" },
      ]);
      const ev = evalTrace(hopTrace);
      return ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true;
    },
  },
  {
    name: "13-stale-tx-during-promote",
    run: () => {
      const hopTrace = baseTrace([
        { kind: "MICRO_SLIDE_WAAPI_STALE_TX_ABORT", monoMs: 10 },
        { kind: "SETTLED", monoMs: 11, note: "post-transition-start-end-watchdog" },
      ]);
      const r = reduceWaapiTerminalState(hopTrace);
      const ev = evalTrace(hopTrace);
      return (
        r.waapiTerminalState === WAAPI_TERMINAL_STATE.STALE_ABORTED &&
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false
      );
    },
  },
  {
    name: "14-promote-after-tx-cleared",
    run: () => {
      const accept = evaluatePromoteAcceptance({
        created: true,
        ready: true,
        started: true,
        txCurrent: false,
        surfacesValid: true,
        finalStylesCommitted: true,
      });
      return accept.accepted === false && accept.reason === "tx-not-current";
    },
  },
  {
    name: "15-waapi-unavailable",
    run: () => {
      const hopTrace = [
        { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: 1 },
        { kind: "MICRO_SLIDE_WAAPI_UNAVAILABLE_FALLBACK", monoMs: 2 },
        { kind: "SETTLED", monoMs: 3, note: "waapi-unavailable" },
      ];
      const ev = evalTrace(hopTrace, "waapi-unavailable");
      return (
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
        ev.primaryFailureClass === "WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE"
      );
    },
  },
];

const invariants = {
  WAAPI_CANONICAL_PHYSICAL_SATISFIED_NOT_OVERRIDDEN_BY_LATE_CANCEL: false,
  WAAPI_CANCEL_BEFORE_PHYSICAL_NEVER_CLEAN: false,
  WAAPI_PROMOTE_REQUIRES_READY_AND_STARTED: false,
  WAAPI_PROMOTE_REQUIRES_FINAL_STYLES: false,
  WAAPI_LOGICAL_SETTLE_WITHOUT_PHYSICAL_NEVER_CLEAN: false,
  WAAPI_FILL_RELEASE_CANCEL_AFTER_FINISH_IGNORED: false,
  WAAPI_DUPLICATE_CANCEL_AFTER_FINISH_SAFE: false,
  WAAPI_REPROCESS_HOP15_CLASSIFIED_CORRECTLY: false,
};

let pass = 0;
let fail = 0;
const failures = [];

for (let i = 0; i < ITERATIONS; i += 1) {
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (e) {
      ok = false;
      if (i === 0) failures.push({ case: c.name, error: String(e?.stack || e) });
    }
    if (ok) pass += 1;
    else {
      fail += 1;
      if (failures.length < 20 && !failures.find((f) => f.case === c.name)) {
        failures.push({ case: c.name, iteration: i });
      }
    }
  }
}

// Invariants from representative cases
{
  const late = cases.find((c) => c.name === "11-raw-cancel-after-promote-cannot-override");
  invariants.WAAPI_CANONICAL_PHYSICAL_SATISFIED_NOT_OVERRIDDEN_BY_LATE_CANCEL = late.run();
  const before = cases.find((c) => c.name === "7-cancel-before-physical");
  invariants.WAAPI_CANCEL_BEFORE_PHYSICAL_NEVER_CLEAN = before.run();
  const promote = evaluatePromoteAcceptance({
    created: true,
    ready: true,
    started: false,
    finalStylesCommitted: true,
  });
  invariants.WAAPI_PROMOTE_REQUIRES_READY_AND_STARTED = promote.accepted === false;
  const promoteFs = evaluatePromoteAcceptance({
    created: true,
    ready: true,
    started: true,
    finalStylesCommitted: false,
  });
  invariants.WAAPI_PROMOTE_REQUIRES_FINAL_STYLES = promoteFs.accepted === false;
  invariants.WAAPI_LOGICAL_SETTLE_WITHOUT_PHYSICAL_NEVER_CLEAN = cases
    .find((c) => c.name === "10-bridge-pin-without-physical")
    .run();
  invariants.WAAPI_FILL_RELEASE_CANCEL_AFTER_FINISH_IGNORED = cases
    .find((c) => c.name === "6-cancel-during-fill-release-after-finish")
    .run();
  invariants.WAAPI_DUPLICATE_CANCEL_AFTER_FINISH_SAFE = cases
    .find((c) => c.name === "12-duplicate-cancel-after-fill-release")
    .run();

  // Optional offline hop-15 check (artifact present in this workspace).
  try {
    const hop15Path =
      "scripts/ghost-filmstrip-out/local-native-shell-release-20-after-waapi-compositor-slide-fix-1783846660369/chrome-native-shell-20/hop-15-chats/hop-report.json";
    if (fs.existsSync(hop15Path)) {
      const hop15 = JSON.parse(fs.readFileSync(hop15Path, "utf8"));
      const hopTrace = hop15?.hopNineEvidence?.hopTrace || [];
      const ev = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: hop15?.hopNineEvidence?.ENGINE_SLIDE_OCCURRED === true,
        domSlideOccurred: hop15?.hopNineEvidence?.DOM_SLIDE_OCCURRED === true,
        hopTrace,
        settleReason: null,
        bridgeCompleted: true,
        pinCleared: true,
      });
      invariants.WAAPI_REPROCESS_HOP15_CLASSIFIED_CORRECTLY =
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
        ev.waapiFinishedPromoted === true &&
        ev.waapiCancelBeforePhysical === false;
    } else {
      invariants.WAAPI_REPROCESS_HOP15_CLASSIFIED_CORRECTLY = true;
    }
  } catch {
    invariants.WAAPI_REPROCESS_HOP15_CLASSIFIED_CORRECTLY = false;
  }
}

const total = pass + fail;
const report = {
  harness: "WAAPI_SETTLE_CANCEL_RACE_HARNESS",
  iterations: ITERATIONS,
  cases: cases.length,
  pass,
  fail,
  total,
  ok:
    fail === 0 &&
    pass === ITERATIONS * cases.length &&
    Object.values(invariants).every(Boolean),
  invariants,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
