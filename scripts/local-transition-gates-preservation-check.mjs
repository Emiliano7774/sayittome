/**
 * LOCAL_TRANSITION_PRECOMMIT_AND_NATIVE_START_GATE_PRESERVATION_CHECK
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateNoScreencastPhysicalEvidence } from "./native-lifecycle-no-screencast-evidence.mjs";
import {
  evaluateNativeTransitionStartGate,
  PRIMARY_STATUS,
} from "./native-transition-start-gate.mjs";
import {
  evaluateWaapiCompositorPhysicalEvidence,
  PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
} from "./waapi-compositor-lifecycle-evidence.mjs";

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const cases = [];

// CSS never-start still classified
{
  const hopTrace = [
    { kind: "PHASE_ARMED" },
    { kind: "PHASE_SLIDING" },
    { kind: "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL" },
    { kind: "MICRO_SLIDE_TRANSITION_FINAL_WRITE_AFTER_PRECOMMIT" },
    { kind: "SETTLED", note: "transition-never-started-after-final-write" },
  ];
  const phys = evaluateNoScreencastPhysicalEvidence({
    engineSlideOccurred: true,
    domSlideOccurred: true,
    finalInlineTargetCommitted: true,
    transitionEvents: [],
    hopTrace,
    settleReason: "transition-never-started-after-final-write",
  });
  const gate = evaluateNativeTransitionStartGate({
    hopTrace,
    transitionEvents: [],
    engineSlideOccurred: true,
    domSlideOccurred: true,
    bridgeCompleted: true,
    pinCleared: true,
    currentHopEvaluationStatus: "FULL_TX_RESOLVED",
    noScreencastPhysicalEvidenceValid: false,
    finalWriteOverrides: {
      finalWriteValid: true,
      transformDeltaNonzero: true,
      cssTransitionApplied: true,
      finalInlineTargetCommitted: true,
    },
  });
  cases.push({
    name: "css-never-start-preserved",
    pass:
      phys.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID === false &&
      gate.physicalNativeTransitionSatisfied === false &&
      (gate.primaryFailureClass ===
        PRIMARY_STATUS.NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE ||
        String(gate.primaryFailureClass || "").includes("NEVER_STARTED")),
  });
}

// WAAPI does not require CSS events
{
  const hopTrace = [
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" },
    { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED" },
    { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED" },
    { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED" },
    { kind: "SETTLED", note: "waapi-finish" },
  ];
  const ev = evaluateWaapiCompositorPhysicalEvidence({
    engineSlideOccurred: true,
    domSlideOccurred: true,
    hopTrace,
    settleReason: "waapi-finish",
  });
  cases.push({
    name: "waapi-no-css-required",
    pass:
      ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true &&
      ev.CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE === true &&
      ev.PHYSICAL_EVIDENCE_PROVIDER_SELECTED === PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
  });
}

// FULL_TX does not imply physical clean
{
  const gate = evaluateNativeTransitionStartGate({
    hopTrace: [{ kind: "SETTLED", note: "transitionend" }],
    transitionEvents: [],
    engineSlideOccurred: true,
    domSlideOccurred: true,
    bridgeCompleted: true,
    pinCleared: true,
    currentHopEvaluationStatus: "FULL_TX_RESOLVED",
    noScreencastPhysicalEvidenceValid: false,
  });
  cases.push({
    name: "full-tx-not-physical-clean",
    pass: gate.physicalNativeTransitionSatisfied !== true,
  });
}

// bridge/pin logical not physical
{
  const ev = evaluateWaapiCompositorPhysicalEvidence({
    engineSlideOccurred: true,
    domSlideOccurred: true,
    hopTrace: [{ kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" }],
    settleReason: "waapi-unavailable",
    bridgeCompleted: true,
    pinCleared: true,
  });
  cases.push({
    name: "bridge-pin-not-physical",
    pass: ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false,
  });
}

// no fake clean archive-only
{
  const ev = evaluateWaapiCompositorPhysicalEvidence({
    engineSlideOccurred: true,
    domSlideOccurred: true,
    hopTrace: [{ kind: "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET" }],
    settleReason: null,
    bridgeCompleted: true,
    pinCleared: true,
  });
  cases.push({
    name: "no-fake-clean-archive-only",
    pass: ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false,
  });
}

const passCount = cases.filter((c) => c.pass).length;
const report = {
  LOCAL_TRANSITION_PRECOMMIT_AND_NATIVE_START_GATE_PRESERVATION_CHECK: `${passCount}/${cases.length}`,
  PASS: passCount === cases.length,
  cases,
};
fs.writeFileSync(
  path.join(outDir, "transition-gates-preservation-check.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(passCount === cases.length ? 0 : 1);
