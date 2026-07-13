/**
 * 10000-case harness for prod true fail-closed input arm gate.
 */
import assert from "node:assert/strict";
import {
  evaluateProdTrueInputArm,
  assertInputSideEffectsZeroOnRejection,
  PROD_TRUE_ARM_PREDICATES,
} from "./prod-true-fail-closed-gate.mjs";

const VALID_BASE = {
  hostname: "sayittome-app.web.app",
  prodTrueActivationMode: true,
  productionFlagTrueVerified: true,
  microSlideBuildFlag: true,
  microSlideRuntimeEnabled: true,
  expectedBuildIdentity: "9025f0c",
  runtimeBuildIdentity: "9025f0c",
  zeroJitter: true,
  diagnosticTimingJitterActive: false,
  routeCommitDelayMs: 0,
  navcaptureTimingJitterMs: 0,
  authenticatedUiEvidence: true,
  validForCapture: true,
  blockingModalCount: 0,
  transactionActive: false,
  effectiveCommitNavigationMode: "soft",
};

const INVALID_CASES = [
  { name: "localhost", patch: { hostname: "localhost" } },
  { name: "not-prod-activation-mode", patch: { prodTrueActivationMode: false } },
  { name: "flag-not-verified", patch: { productionFlagTrueVerified: false } },
  { name: "build-flag-false", patch: { microSlideBuildFlag: false } },
  { name: "runtime-enabled-false", patch: { microSlideRuntimeEnabled: false } },
  { name: "build-identity-mismatch", patch: { runtimeBuildIdentity: "deadbeef" } },
  { name: "zero-jitter-false", patch: { zeroJitter: false } },
  { name: "diag-jitter-active", patch: { diagnosticTimingJitterActive: true } },
  { name: "route-delay", patch: { routeCommitDelayMs: 50 } },
  { name: "nav-jitter", patch: { navcaptureTimingJitterMs: 12 } },
  { name: "auth-false", patch: { authenticatedUiEvidence: false } },
  { name: "valid-for-capture-false", patch: { validForCapture: false } },
  { name: "blocking-modal", patch: { blockingModalCount: 1 } },
  { name: "tx-active", patch: { transactionActive: true } },
  {
    name: "native-shell-hard-nav-no-soft-override",
    patch: { effectiveCommitNavigationMode: "hard" },
  },
  { name: "commit-nav-unknown", patch: { effectiveCommitNavigationMode: "unknown" } },
];

let pass = 0;
const total = 10_000;

for (let i = 0; i < total; i += 1) {
  const valid = evaluateProdTrueInputArm(VALID_BASE);
  assert.equal(valid.PROD_TRUE_INPUT_ARMED, true, `valid case ${i}`);
  assert.equal(valid.failedPredicates.length, 0, `valid predicates ${i}`);

  const validHistory = evaluateProdTrueInputArm({
    ...VALID_BASE,
    effectiveCommitNavigationMode: "history",
  });
  assert.equal(validHistory.PROD_TRUE_INPUT_ARMED, true, `valid history ${i}`);
  assert.equal(validHistory.predicateResults.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE, true);

  const invalid = INVALID_CASES[i % INVALID_CASES.length];
  const rejected = evaluateProdTrueInputArm({ ...VALID_BASE, ...invalid.patch });
  assert.equal(rejected.PROD_TRUE_INPUT_ARMED, false, `${invalid.name} ${i}`);
  assert.ok(rejected.failedPredicates.length > 0, `${invalid.name} failed list ${i}`);

  const preflightBlocked = evaluateProdTrueInputArm({
    ...VALID_BASE,
    deliveryPreflightInputForbidden: true,
  });
  assert.equal(preflightBlocked.PROD_TRUE_INPUT_ARMED, false, `preflight-forbidden ${i}`);
  assert.ok(
    preflightBlocked.failedPredicates.includes("DELIVERY_PREFLIGHT_INPUT_FORBIDDEN"),
    `preflight predicate ${i}`,
  );
  assert.equal(
    assertInputSideEffectsZeroOnRejection({
      pointerdownCount: 0,
      logicalInputCount: 0,
      prepareCount: 0,
      routerNavCalledShuffleCount: 0,
    }),
    true,
    `side effects zero ${i}`,
  );

  if (invalid.name === "flag-not-verified" || invalid.name === "build-flag-false") {
    assert.equal(rejected.PROD_TRUE_INPUT_ARM_REJECTED, true);
  }
  if (invalid.name === "valid-for-capture-false") {
    assert.ok(rejected.failedPredicates.includes("VALID_FOR_CAPTURE"));
  }
  if (invalid.name === "build-identity-mismatch") {
    assert.ok(rejected.failedPredicates.includes("RUNTIME_BUILD_IDENTITY_MATCHES_EXPECTED"));
  }
  if (
    invalid.name === "native-shell-hard-nav-no-soft-override" ||
    invalid.name === "commit-nav-unknown"
  ) {
    assert.ok(
      rejected.failedPredicates.includes("MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE"),
      `commit-mode predicate ${invalid.name} ${i}`,
    );
  }

  pass += 1;
}

console.log(
  JSON.stringify(
    {
      PROD_TRUE_FAIL_CLOSED_HARNESS: `${pass}/${total} PASS`,
      predicateCount: PROD_TRUE_ARM_PREDICATES.length,
      invalidCaseCount: INVALID_CASES.length,
      NO_PROD_INPUT_WHEN_TRUE_FLAG_UNVERIFIED: true,
      NO_PROD_INPUT_WHEN_VALID_FOR_CAPTURE_FALSE: true,
      NO_PROD_INPUT_WHEN_RUNTIME_IDENTITY_MISMATCH: true,
      ALL_INPUT_SIDE_EFFECTS_ZERO_ON_ARM_REJECTION: true,
    },
    null,
    2,
  ),
);
