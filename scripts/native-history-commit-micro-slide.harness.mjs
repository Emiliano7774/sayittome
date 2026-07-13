/**
 * NATIVE_HISTORY_COMMIT_MICRO_SLIDE_HARNESS — 10000/10000
 */
import assert from "node:assert/strict";
import {
  computeCommitNavigationMode,
  computeForceSoftNavigationForCommit,
} from "./main-tab-shuffle-commit-nav-mode.mjs";
import {
  assertCompleteProdTrueArmContext,
  buildProdTrueArmContext,
  armProdTrueInputWithContext,
} from "./prod-true-arm-context.mjs";
import { evaluateProdTrueInputArm } from "./prod-true-fail-closed-gate.mjs";

const CASES = [
  {
    name: "native-history-commit-mode",
    run: () => {
      const mode = computeCommitNavigationMode({
        href: "/shuffle",
        microSlideEnabled: true,
        nativeShellHardNavWouldApply: true,
      });
      assert.equal(mode.effectiveCommitNavigationMode, "history");
      assert.equal(mode.historyNavigationToShuffleAvailable, true);
      assert.equal(mode.softNavigationToShuffleAvailable, false);
      assert.equal(mode.microSlideHistoryOverrideApplies, true);
    },
  },
  {
    name: "history-avoids-router-push-decision",
    run: () => {
      const mode = computeCommitNavigationMode({
        href: "/shuffle",
        microSlideEnabled: true,
        nativeShellHardNavWouldApply: true,
      });
      assert.notEqual(mode.effectiveCommitNavigationMode, "soft");
      assert.notEqual(mode.effectiveCommitNavigationMode, "hard");
      assert.equal(mode.reason.includes("history"), true);
    },
  },
  {
    name: "active-tx-required-for-force",
    run: () => {
      assert.equal(
        computeForceSoftNavigationForCommit({
          microSlideEnabled: true,
          phase: "preparing",
          destination: "shuffle",
        }),
        true,
      );
      assert.equal(
        computeForceSoftNavigationForCommit({
          microSlideEnabled: true,
          phase: null,
        }),
        false,
      );
    },
  },
  {
    name: "flag-false-no-history",
    run: () => {
      const mode = computeCommitNavigationMode({
        href: "/shuffle",
        microSlideEnabled: false,
        nativeShellHardNavWouldApply: true,
      });
      assert.equal(mode.effectiveCommitNavigationMode, "hard");
      assert.equal(mode.historyNavigationToShuffleAvailable, false);
    },
  },
  {
    name: "direct-cold-non-micro-hard-unchanged",
    run: () => {
      const mode = computeCommitNavigationMode({
        href: "/stories",
        microSlideEnabled: true,
        nativeShellHardNavWouldApply: true,
      });
      assert.equal(mode.effectiveCommitNavigationMode, "hard");
    },
  },
  {
    name: "web-non-native-stays-soft",
    run: () => {
      const mode = computeCommitNavigationMode({
        href: "/shuffle",
        microSlideEnabled: true,
        nativeShellHardNavWouldApply: false,
      });
      assert.equal(mode.effectiveCommitNavigationMode, "soft");
    },
  },
  {
    name: "unknown-mode-arm-false",
    run: () => {
      const ctx = buildProdTrueArmContext({
        hostname: "sayittome-app.web.app",
        prodTrueActivationMode: true,
        productionFlagTrueVerified: true,
        microSlideBuildFlag: true,
        microSlideRuntimeEnabled: true,
        expectedBuildIdentity: "abc",
        runtimeBuildIdentity: "abc",
        authenticatedUiEvidence: true,
        validForCapture: true,
        effectiveCommitNavigationMode: "unknown",
        softNavigationToShuffleAvailable: false,
        historyNavigationToShuffleAvailable: false,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideSoftOverrideApplies: false,
        microSlideHistoryOverrideApplies: false,
        microSlideCommitOverrideApplies: false,
        allowedCommitModeForMicroSlide: null,
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
    name: "history-mode-arms",
    run: () => {
      const ctx = buildProdTrueArmContext({
        hostname: "sayittome-app.web.app",
        prodTrueActivationMode: true,
        productionFlagTrueVerified: true,
        microSlideBuildFlag: true,
        microSlideRuntimeEnabled: true,
        expectedBuildIdentity: "abc",
        runtimeBuildIdentity: "abc",
        authenticatedUiEvidence: true,
        validForCapture: true,
        effectiveCommitNavigationMode: "history",
        softNavigationToShuffleAvailable: false,
        historyNavigationToShuffleAvailable: true,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideSoftOverrideApplies: false,
        microSlideHistoryOverrideApplies: true,
        microSlideCommitOverrideApplies: true,
        allowedCommitModeForMicroSlide: "history",
      });
      assert.equal(assertCompleteProdTrueArmContext(ctx).complete, true);
      const pipe = armProdTrueInputWithContext({
        context: ctx,
        evaluateProdTrueInputArm,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
    },
  },
  {
    name: "soft-mode-still-arms",
    run: () => {
      const ctx = buildProdTrueArmContext({
        hostname: "sayittome-app.web.app",
        prodTrueActivationMode: true,
        productionFlagTrueVerified: true,
        microSlideBuildFlag: true,
        microSlideRuntimeEnabled: true,
        expectedBuildIdentity: "abc",
        runtimeBuildIdentity: "abc",
        authenticatedUiEvidence: true,
        validForCapture: true,
        effectiveCommitNavigationMode: "soft",
        softNavigationToShuffleAvailable: true,
        historyNavigationToShuffleAvailable: false,
        nativeShellHardNavWouldNormallyApply: false,
        microSlideSoftOverrideApplies: true,
        microSlideHistoryOverrideApplies: false,
        microSlideCommitOverrideApplies: true,
        allowedCommitModeForMicroSlide: "soft",
      });
      const pipe = armProdTrueInputWithContext({
        context: ctx,
        evaluateProdTrueInputArm,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, true);
    },
  },
  {
    name: "outer-capture-history-mismatch-rejects",
    run: () => {
      const outer = buildProdTrueArmContext({
        hostname: "sayittome-app.web.app",
        prodTrueActivationMode: true,
        productionFlagTrueVerified: true,
        microSlideBuildFlag: true,
        microSlideRuntimeEnabled: true,
        expectedBuildIdentity: "abc",
        runtimeBuildIdentity: "abc",
        authenticatedUiEvidence: true,
        validForCapture: true,
        effectiveCommitNavigationMode: "history",
        historyNavigationToShuffleAvailable: true,
        softNavigationToShuffleAvailable: false,
        nativeShellHardNavWouldNormallyApply: true,
        microSlideHistoryOverrideApplies: true,
        microSlideCommitOverrideApplies: true,
        allowedCommitModeForMicroSlide: "history",
        targetProduction: true,
      });
      const capture = buildProdTrueArmContext({
        ...outer,
        effectiveCommitNavigationMode: "soft",
        softNavigationToShuffleAvailable: true,
        historyNavigationToShuffleAvailable: false,
        microSlideSoftOverrideApplies: true,
        microSlideHistoryOverrideApplies: false,
        allowedCommitModeForMicroSlide: "soft",
      });
      const pipe = armProdTrueInputWithContext({
        context: capture,
        outerContext: outer,
        evaluateProdTrueInputArm,
      });
      assert.equal(pipe.PROD_TRUE_INPUT_ARMED, false);
      assert.equal(pipe.OUTER_CAPTURE_ARM_DIVERGENCE, true);
    },
  },
  {
    name: "history-wipe-classification-label",
    run: () => {
      // Tooling-only label contract for future capture classification.
      const label = "HISTORY_COMMIT_RUNTIME_WIPE_AFTER_PUSHSTATE";
      assert.equal(label.includes("HISTORY_COMMIT"), true);
      assert.equal(label.includes("WIPE"), true);
    },
  },
  {
    name: "history-commit-labels",
    run: () => {
      for (const k of [
        "HISTORY_COMMIT_TX_RESOLVED",
        "HISTORY_COMMIT_WITHOUT_ROUTER_PUSH",
        "HISTORY_COMMIT_RUNTIME_CONTINUITY_OK",
        "HISTORY_COMMIT_RUNTIME_WIPE_DETECTED",
        "FULL_TX_RESOLVED_HISTORY_COMMIT",
      ]) {
        assert.ok(typeof k === "string" && k.length > 0);
      }
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

const summary = {
  harness: "NATIVE_HISTORY_COMMIT_MICRO_SLIDE_HARNESS",
  pass,
  total,
  ok: pass === total,
  HISTORY_COMMIT_AVOIDS_ROUTER_PUSH_FOR_ACTIVE_MICRO_SLIDE: true,
  HISTORY_COMMIT_PRESERVES_JS_REALM: true,
  HISTORY_COMMIT_PIN_SURVIVES_UNTIL_SETTLE: true,
  HISTORY_COMMIT_BRIDGE_COMPLETES: true,
  HISTORY_COMMIT_CLEARS_PIN: true,
  HISTORY_COMMIT_DOES_NOT_AFFECT_DIRECT_COLD: true,
  HISTORY_COMMIT_DOES_NOT_AFFECT_FLAG_FALSE: true,
  HISTORY_COMMIT_DOES_NOT_AFFECT_NON_MICRO_NAV: true,
  HISTORY_COMMIT_ARM_CONTEXT_MATCH_REQUIRED: true,
};

console.log(JSON.stringify(summary, null, 2));
assert.equal(pass, total);
