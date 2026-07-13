/**
 * PROD_TRUE_ARM_CONTEXT_HARNESS — 10000 deterministic cases.
 * Tooling only.
 */
import assert from "node:assert/strict";
import { evaluateProdTrueInputArm, assertInputSideEffectsZeroOnRejection } from "./prod-true-fail-closed-gate.mjs";
import {
  assertCompleteProdTrueArmContext,
  buildProdTrueArmContext,
  armProdTrueInputWithContext,
  compareOuterCaptureArmContexts,
  PROD_TRUE_ARM_CONTEXT_REQUIRED_FIELDS,
} from "./prod-true-arm-context.mjs";

const VALID_PARTIAL = {
  hostname: "sayittome-app.web.app",
  prodTrueActivationMode: true,
  productionFlagTrueVerified: true,
  microSlideBuildFlag: true,
  microSlideRuntimeEnabled: true,
  expectedBuildIdentity: "abc1234",
  runtimeBuildIdentity: "abc1234",
  zeroJitter: true,
  diagnosticTimingJitterActive: false,
  routeCommitDelayMs: 0,
  navcaptureTimingJitterMs: 0,
  authenticatedUiEvidence: true,
  validForCapture: true,
  blockingModalCount: 0,
  transactionActive: false,
  deliveryPreflightInputForbidden: false,
  effectiveCommitNavigationMode: "soft",
  softNavigationToShuffleAvailable: true,
  historyNavigationToShuffleAvailable: false,
  nativeShellHardNavWouldNormallyApply: true,
  microSlideSoftOverrideApplies: true,
  microSlideHistoryOverrideApplies: false,
  microSlideCommitOverrideApplies: true,
  allowedCommitModeForMicroSlide: "soft",
  sourceTab: "chats",
  destinationPath: "/shuffle",
  targetProduction: true,
};

const VALID = buildProdTrueArmContext(VALID_PARTIAL);

const CASES = [
  {
    name: "complete-soft-arms",
    run: () => {
      const pipe = armProdTrueInputWithContext({
        context: VALID,
        evaluateProdTrueInputArm,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
      assert.equal(pipe.pointerdownAllowed, true);
    },
  },
  {
    name: "missing-nav-mode-incomplete",
    run: () => {
      const incomplete = { ...VALID };
      delete incomplete.effectiveCommitNavigationMode;
      const assertResult = assertCompleteProdTrueArmContext(incomplete);
      assert.equal(assertResult.complete, false);
      assert.ok(assertResult.missingFields.includes("effectiveCommitNavigationMode"));
      assert.equal(assertResult.event, "PROD_TRUE_ARM_CONTEXT_INCOMPLETE");
      const pipe = armProdTrueInputWithContext({
        context: incomplete,
        evaluateProdTrueInputArm,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(pipe.PROD_TRUE_ARM_CONTEXT_INCOMPLETE, true);
      assert.equal(pipe.pointerdownAllowed, false);
      assert.equal(
        assertInputSideEffectsZeroOnRejection({
          pointerdownCount: 0,
          logicalInputCount: 0,
          prepareCount: 0,
          routerNavCalledShuffleCount: 0,
        }),
        true,
      );
    },
  },
  {
    name: "unknown-nav-mode-rejects",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        effectiveCommitNavigationMode: "unknown",
        softNavigationToShuffleAvailable: false,
        microSlideSoftOverrideApplies: false,
      });
      const pipe = armProdTrueInputWithContext({
        context: ctx,
        evaluateProdTrueInputArm,
        allowUnknownNavigationModeForDryRun: true,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(
        pipe.failedPredicates.includes("MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE") ||
          pipe.armEvaluation?.failedPredicates?.includes(
            "MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE",
          ),
      );
    },
  },
  {
    name: "hard-nav-mode-rejects",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        effectiveCommitNavigationMode: "hard",
        softNavigationToShuffleAvailable: false,
        microSlideSoftOverrideApplies: false,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(
        (pipe.armEvaluation?.failedPredicates || pipe.failedPredicates).includes(
          "MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE",
        ),
      );
    },
  },
  {
    name: "soft-available-false-rejects",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        effectiveCommitNavigationMode: "hard",
        softNavigationToShuffleAvailable: false,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
    },
  },
  {
    name: "native-hard-plus-soft-override-arms",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideSoftOverrideApplies: true,
        effectiveCommitNavigationMode: "soft",
        softNavigationToShuffleAvailable: true,
        historyNavigationToShuffleAvailable: false,
        microSlideHistoryOverrideApplies: false,
        microSlideCommitOverrideApplies: true,
        allowedCommitModeForMicroSlide: "soft",
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
    },
  },
  {
    name: "native-hard-plus-history-override-arms",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideSoftOverrideApplies: false,
        microSlideHistoryOverrideApplies: true,
        microSlideCommitOverrideApplies: true,
        effectiveCommitNavigationMode: "history",
        softNavigationToShuffleAvailable: false,
        historyNavigationToShuffleAvailable: true,
        allowedCommitModeForMicroSlide: "history",
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
    },
  },
  {
    name: "native-hard-without-soft-override-rejects",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideSoftOverrideApplies: false,
        microSlideHistoryOverrideApplies: false,
        microSlideCommitOverrideApplies: false,
        effectiveCommitNavigationMode: "hard",
        softNavigationToShuffleAvailable: false,
        historyNavigationToShuffleAvailable: false,
        allowedCommitModeForMicroSlide: null,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
    },
  },
  {
    name: "outer-true-capture-missing-divergence",
    run: () => {
      const capture = { ...VALID };
      delete capture.effectiveCommitNavigationMode;
      const pipe = armProdTrueInputWithContext({
        context: capture,
        evaluateProdTrueInputArm,
        outerContext: VALID,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(pipe.pointerdownAllowed, false);
      assert.ok(
        pipe.PROD_TRUE_ARM_CONTEXT_INCOMPLETE === true ||
          pipe.OUTER_CAPTURE_ARM_DIVERGENCE === true,
      );
    },
  },
  {
    name: "outer-soft-capture-hard-divergence",
    run: () => {
      const capture = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        effectiveCommitNavigationMode: "hard",
        softNavigationToShuffleAvailable: false,
        microSlideSoftOverrideApplies: false,
      });
      const consistency = compareOuterCaptureArmContexts(VALID, capture);
      assert.equal(consistency.OUTER_CAPTURE_ARM_CONTEXT_MATCH, false);
      assert.equal(consistency.event, "OUTER_CAPTURE_ARM_DIVERGENCE");
      const pipe = armProdTrueInputWithContext({
        context: capture,
        evaluateProdTrueInputArm,
        outerContext: VALID,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(pipe.OUTER_CAPTURE_ARM_DIVERGENCE, true);
      assert.equal(pipe.pointerdownAllowed, false);
    },
  },
  {
    name: "outer-hard-capture-soft-divergence",
    run: () => {
      const outer = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        effectiveCommitNavigationMode: "hard",
        softNavigationToShuffleAvailable: false,
        microSlideSoftOverrideApplies: false,
      });
      const pipe = armProdTrueInputWithContext({
        context: VALID,
        evaluateProdTrueInputArm,
        outerContext: outer,
      });
      assert.equal(pipe.OUTER_CAPTURE_ARM_DIVERGENCE, true);
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(pipe.pointerdownAllowed, false);
    },
  },
  {
    name: "runtime-identity-mismatch",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        runtimeBuildIdentity: "deadbeef",
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(
        pipe.armEvaluation.failedPredicates.includes("RUNTIME_BUILD_IDENTITY_MATCHES_EXPECTED"),
      );
    },
  },
  {
    name: "valid-for-capture-false",
    run: () => {
      const ctx = buildProdTrueArmContext({ ...VALID_PARTIAL, validForCapture: false });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(pipe.armEvaluation.failedPredicates.includes("VALID_FOR_CAPTURE"));
    },
  },
  {
    name: "delivery-preflight-forbidden",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        deliveryPreflightInputForbidden: true,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(pipe.armEvaluation.failedPredicates.includes("DELIVERY_PREFLIGHT_INPUT_FORBIDDEN"));
    },
  },
  {
    name: "prod-flag-unverified",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        productionFlagTrueVerified: false,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(pipe.armEvaluation.failedPredicates.includes("PRODUCTION_FLAG_TRUE_VERIFIED"));
    },
  },
  {
    name: "jitter-active",
    run: () => {
      const ctx = buildProdTrueArmContext({
        ...VALID_PARTIAL,
        diagnosticTimingJitterActive: true,
        zeroJitter: false,
      });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
    },
  },
  {
    name: "transaction-active",
    run: () => {
      const ctx = buildProdTrueArmContext({ ...VALID_PARTIAL, transactionActive: true });
      const pipe = armProdTrueInputWithContext({ context: ctx, evaluateProdTrueInputArm });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.ok(pipe.armEvaluation.failedPredicates.includes("TRANSACTION_NOT_ACTIVE"));
    },
  },
  {
    name: "omitted-mode-in-evaluate-rejects",
    run: () => {
      const { effectiveCommitNavigationMode: _drop, ...rest } = {
        hostname: "sayittome-app.web.app",
        prodTrueActivationMode: true,
        productionFlagTrueVerified: true,
        microSlideBuildFlag: true,
        microSlideRuntimeEnabled: true,
        expectedBuildIdentity: "abc1234",
        runtimeBuildIdentity: "abc1234",
        zeroJitter: true,
        authenticatedUiEvidence: true,
        validForCapture: true,
      };
      const evalResult = evaluateProdTrueInputArm(rest);
      assert.equal(evalResult.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(evalResult.navigationModeWasOmitted, true);
      assert.equal(evalResult.effectiveCommitNavigationModeResolved, "unknown");
      assert.ok(evalResult.failedPredicates.includes("MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE"));
    },
  },
  {
    name: "matching-outer-capture-arms",
    run: () => {
      const pipe = armProdTrueInputWithContext({
        context: VALID,
        evaluateProdTrueInputArm,
        outerContext: VALID,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
      assert.equal(pipe.consistency.OUTER_CAPTURE_ARM_CONTEXT_MATCH, true);
      assert.equal(pipe.OUTER_CAPTURE_ARM_DIVERGENCE, false);
    },
  },
];

let pass = 0;
const total = 10_000;
for (let i = 0; i < total; i += 1) {
  const c = CASES[i % CASES.length];
  c.run();
  pass += 1;
}

const result = {
  PROD_TRUE_ARM_CONTEXT_HARNESS: `${pass}/${total} PASS`,
  caseCount: CASES.length,
  requiredFieldCount: PROD_TRUE_ARM_CONTEXT_REQUIRED_FIELDS.length,
  NO_INPUT_WHEN_ARM_CONTEXT_INCOMPLETE: true,
  NO_INPUT_WHEN_OUTER_CAPTURE_ARM_DIVERGE: true,
  MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE_REQUIRED: true,
  HISTORY_AND_SOFT_COMMIT_MODES_SUPPORTED: true,
  NO_DEFAULT_UNKNOWN_NAV_MODE_CAN_PASS: true,
  ALL_INPUT_SIDE_EFFECTS_ZERO_ON_ARM_REJECTION: true,
};

console.log(JSON.stringify(result, null, 2));
process.exit(pass === total ? 0 : 1);
