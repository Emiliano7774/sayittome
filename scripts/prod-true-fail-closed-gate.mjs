/**
 * Fail-closed gate for production true-flag hop input.
 * Tooling only — no motor changes.
 *
 * effectiveCommitNavigationMode MUST be supplied by the caller.
 * There is no silent default to "unknown" that could pass.
 * Omitted / null / undefined → treated as "unknown" AND fails soft-nav
 * (arm=false). Prefer assertCompleteProdTrueArmContext before calling.
 */

export const PROD_TRUE_ARM_PREDICATES = [
  "TARGET_IS_PRODUCTION",
  "SOURCE_FLAG_ACTIVATION_MODE_REAL_PRODUCTION",
  "DELIVERY_PREFLIGHT_INPUT_FORBIDDEN",
  "PRODUCTION_FLAG_TRUE_VERIFIED",
  "MICRO_SLIDE_BUILD_FLAG_TRUE",
  "MICRO_SLIDE_RUNTIME_ENABLED_TRUE",
  "RUNTIME_BUILD_IDENTITY_MATCHES_EXPECTED",
  "ZERO_JITTER",
  "DIAGNOSTIC_TIMING_JITTER_INACTIVE",
  "ROUTE_COMMIT_DELAY_MS_ZERO",
  "NAVCAPTURE_TIMING_JITTER_ZERO",
  "AUTHENTICATED_UI_EVIDENCE",
  "VALID_FOR_CAPTURE",
  "BLOCKING_MODAL_COUNT_ZERO",
  "TRANSACTION_NOT_ACTIVE",
  // soft | history same-document commit modes; hard/unknown reject.
  "MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE",
];

export function isProductionHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1" && host.length > 0;
}

function normalizeBuildIdentity(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function buildIdentityMatches(expected, runtime) {
  const exp = normalizeBuildIdentity(expected);
  const run = normalizeBuildIdentity(runtime);
  if (!exp || !run) return false;
  if (exp === run) return true;
  if (run.startsWith(exp) || exp.startsWith(run)) return true;
  return false;
}

/**
 * @returns {{
 *   PROD_TRUE_INPUT_ARMED: boolean,
 *   PROD_TRUE_INPUT_ARM_REJECTED: boolean,
 *   failedPredicates: string[],
 *   predicateResults: Record<string, boolean>,
 *   effectiveCommitNavigationModeResolved: string,
 *   navigationModeWasOmitted: boolean,
 * }}
 */
export function evaluateProdTrueInputArm(input = {}) {
  // No silent soft default. Omitted → unknown → soft-nav predicate fails.
  const navigationModeWasOmitted = !Object.prototype.hasOwnProperty.call(
    input,
    "effectiveCommitNavigationMode",
  );
  const effectiveCommitNavigationMode = navigationModeWasOmitted
    ? "unknown"
    : input.effectiveCommitNavigationMode == null
      ? "unknown"
      : input.effectiveCommitNavigationMode;

  const hostname = input.hostname ?? "";
  const prodTrueActivationMode = input.prodTrueActivationMode === true;
  const productionFlagTrueVerified = input.productionFlagTrueVerified === true;
  const microSlideBuildFlag = input.microSlideBuildFlag === true;
  const microSlideRuntimeEnabled = input.microSlideRuntimeEnabled === true;
  const expectedBuildIdentity = input.expectedBuildIdentity ?? null;
  const runtimeBuildIdentity = input.runtimeBuildIdentity ?? null;
  const zeroJitter = input.zeroJitter !== false;
  const diagnosticTimingJitterActive = input.diagnosticTimingJitterActive === true;
  const routeCommitDelayMs = Number(input.routeCommitDelayMs ?? 0);
  const navcaptureTimingJitterMs = Number(input.navcaptureTimingJitterMs ?? 0);
  const authenticatedUiEvidence = input.authenticatedUiEvidence === true;
  const validForCapture = input.validForCapture === true;
  const blockingModalCount = Number(input.blockingModalCount ?? 0);
  const transactionActive = input.transactionActive === true;
  const deliveryPreflightInputForbidden = input.deliveryPreflightInputForbidden === true;

  const predicateResults = {
    TARGET_IS_PRODUCTION: isProductionHostname(hostname),
    SOURCE_FLAG_ACTIVATION_MODE_REAL_PRODUCTION: prodTrueActivationMode === true,
    DELIVERY_PREFLIGHT_INPUT_FORBIDDEN: deliveryPreflightInputForbidden !== true,
    PRODUCTION_FLAG_TRUE_VERIFIED: productionFlagTrueVerified === true,
    MICRO_SLIDE_BUILD_FLAG_TRUE: microSlideBuildFlag === true,
    MICRO_SLIDE_RUNTIME_ENABLED_TRUE: microSlideRuntimeEnabled === true,
    RUNTIME_BUILD_IDENTITY_MATCHES_EXPECTED: buildIdentityMatches(
      expectedBuildIdentity,
      runtimeBuildIdentity,
    ),
    ZERO_JITTER: zeroJitter === true,
    DIAGNOSTIC_TIMING_JITTER_INACTIVE: diagnosticTimingJitterActive !== true,
    ROUTE_COMMIT_DELAY_MS_ZERO: routeCommitDelayMs === 0,
    NAVCAPTURE_TIMING_JITTER_ZERO: navcaptureTimingJitterMs === 0,
    AUTHENTICATED_UI_EVIDENCE: authenticatedUiEvidence === true,
    VALID_FOR_CAPTURE: validForCapture === true,
    BLOCKING_MODAL_COUNT_ZERO: blockingModalCount === 0,
    TRANSACTION_NOT_ACTIVE: transactionActive !== true,
    // soft | history; hard and unknown both reject. Omitted mode resolves to unknown → reject.
    MAIN_TAB_TO_SHUFFLE_COMMIT_MODE_AVAILABLE:
      effectiveCommitNavigationMode === "soft" ||
      effectiveCommitNavigationMode === "history",
    // Diagnostic mirrors (not in PROD_TRUE_ARM_PREDICATES list, but useful in results).
    SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE: effectiveCommitNavigationMode === "soft",
    HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE: effectiveCommitNavigationMode === "history",
  };

  const failedPredicates = PROD_TRUE_ARM_PREDICATES.filter((key) => predicateResults[key] !== true);
  const armed = failedPredicates.length === 0;

  return {
    PROD_TRUE_INPUT_ARMED: armed,
    PROD_TRUE_INPUT_ARM_REJECTED: !armed,
    failedPredicates,
    predicateResults,
    effectiveCommitNavigationModeResolved: effectiveCommitNavigationMode,
    navigationModeWasOmitted,
  };
}

export function assertInputSideEffectsZeroOnRejection({
  pointerdownCount = 0,
  logicalInputCount = 0,
  prepareCount = 0,
  routerNavCalledShuffleCount = 0,
} = {}) {
  return (
    pointerdownCount === 0 &&
    logicalInputCount === 0 &&
    prepareCount === 0 &&
    routerNavCalledShuffleCount === 0
  );
}
