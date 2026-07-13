/**
 * Canonical production true-flag arm context contract.
 * Tooling only — no motor / watchdog / bridge changes.
 *
 * Rule: never silently default effectiveCommitNavigationMode to "unknown"
 * in a way that could pass predicates. Missing → incomplete (abort before input).
 * Explicit "unknown" / "hard" → arm false via SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE.
 */

export const PROD_TRUE_ARM_CONTEXT_REQUIRED_FIELDS = [
  "hostname",
  "prodTrueActivationMode",
  "productionFlagTrueVerified",
  "microSlideBuildFlag",
  "microSlideRuntimeEnabled",
  "expectedBuildIdentity",
  "runtimeBuildIdentity",
  "runtimeIdentityMatch",
  "zeroJitter",
  "diagnosticTimingJitterActive",
  "routeCommitDelayMs",
  "navcaptureTimingJitterMs",
  "authenticatedUiEvidence",
  "validForCapture",
  "blockingModalCount",
  "transactionActive",
  "deliveryPreflightInputForbidden",
  "effectiveCommitNavigationMode",
  "softNavigationToShuffleAvailable",
  "historyNavigationToShuffleAvailable",
  "nativeShellHardNavWouldNormallyApply",
  "microSlideSoftOverrideApplies",
  "microSlideHistoryOverrideApplies",
  "microSlideCommitOverrideApplies",
  "allowedCommitModeForMicroSlide",
  "sourceTab",
  "destinationPath",
];

export const OUTER_CAPTURE_ARM_MATCH_FIELDS = [
  "effectiveCommitNavigationMode",
  "softNavigationToShuffleAvailable",
  "historyNavigationToShuffleAvailable",
  "nativeShellHardNavWouldNormallyApply",
  "microSlideSoftOverrideApplies",
  "microSlideHistoryOverrideApplies",
  "microSlideCommitOverrideApplies",
  "allowedCommitModeForMicroSlide",
  "runtimeBuildIdentity",
  "productionFlagTrueVerified",
  "microSlideBuildFlag",
  "microSlideRuntimeEnabled",
  "zeroJitter",
  "sourceTab",
  "destinationPath",
  "targetProduction",
  "authenticatedUiEvidence",
  "blockingModalCount",
  "transactionActive",
];

const NAV_MODES = new Set(["soft", "history", "hard", "unknown"]);

/**
 * @param {Record<string, unknown>} context
 * @param {{ allowUnknownNavigationModeForDryRun?: boolean }} [opts]
 */
export function assertCompleteProdTrueArmContext(context, opts = {}) {
  const missingFields = [];
  const ctx = context && typeof context === "object" ? context : {};

  for (const field of PROD_TRUE_ARM_CONTEXT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(ctx, field) || ctx[field] === undefined) {
      missingFields.push(field);
      continue;
    }
    if (
      field === "effectiveCommitNavigationMode" &&
      (ctx[field] === null || ctx[field] === "")
    ) {
      missingFields.push(field);
    }
  }

  const mode = ctx.effectiveCommitNavigationMode;
  if (mode != null && !NAV_MODES.has(mode)) {
    missingFields.push("effectiveCommitNavigationMode(invalid)");
  }

  // Explicit unknown is only allowed when caller opts into dry-run incomplete path;
  // it must still leave the context "complete" enough to evaluate (and arm=false).
  if (mode === "unknown" && opts.allowUnknownNavigationModeForDryRun !== true) {
    // For prod hop: treat as present-but-rejecting (complete=true, evaluate will fail soft-nav).
    // Do NOT auto-complete missing mode as unknown.
  }

  const complete = missingFields.length === 0;
  return {
    complete,
    missingFields,
    event: complete ? null : "PROD_TRUE_ARM_CONTEXT_INCOMPLETE",
    allowUnknownNavigationModeForDryRun: opts.allowUnknownNavigationModeForDryRun === true,
  };
}

/**
 * Build a canonical context object from collected page/runtime fields.
 * Does not invent navigation mode — caller must supply it or leave undefined (incomplete).
 */
export function buildProdTrueArmContext(partial = {}) {
  const mode = partial.effectiveCommitNavigationMode;
  const softAvailable =
    partial.softNavigationToShuffleAvailable != null
      ? partial.softNavigationToShuffleAvailable === true
      : mode === "soft";
  const historyAvailable =
    partial.historyNavigationToShuffleAvailable != null
      ? partial.historyNavigationToShuffleAvailable === true
      : mode === "history";

  const expected = partial.expectedBuildIdentity ?? null;
  const runtime = partial.runtimeBuildIdentity ?? null;
  const identityMatch =
    partial.runtimeIdentityMatch != null
      ? partial.runtimeIdentityMatch === true
      : identitiesMatch(expected, runtime);

  const microSlideHistoryOverrideApplies =
    partial.microSlideHistoryOverrideApplies != null
      ? partial.microSlideHistoryOverrideApplies === true
      : mode === "history";
  const microSlideSoftOverrideApplies =
    partial.microSlideSoftOverrideApplies != null
      ? partial.microSlideSoftOverrideApplies === true
      : mode === "soft";
  const microSlideCommitOverrideApplies =
    partial.microSlideCommitOverrideApplies != null
      ? partial.microSlideCommitOverrideApplies === true
      : microSlideSoftOverrideApplies || microSlideHistoryOverrideApplies;
  const allowedCommitModeForMicroSlide =
    partial.allowedCommitModeForMicroSlide !== undefined
      ? partial.allowedCommitModeForMicroSlide
      : mode === "soft" || mode === "history"
        ? mode
        : null;

  return {
    hostname: partial.hostname ?? "",
    prodTrueActivationMode: partial.prodTrueActivationMode === true,
    productionFlagTrueVerified: partial.productionFlagTrueVerified === true,
    microSlideBuildFlag: partial.microSlideBuildFlag === true,
    microSlideRuntimeEnabled: partial.microSlideRuntimeEnabled === true,
    expectedBuildIdentity: expected,
    runtimeBuildIdentity: runtime,
    runtimeIdentityMatch: identityMatch,
    zeroJitter: partial.zeroJitter !== false,
    diagnosticTimingJitterActive: partial.diagnosticTimingJitterActive === true,
    routeCommitDelayMs: Number(partial.routeCommitDelayMs ?? 0),
    navcaptureTimingJitterMs: Number(
      partial.navcaptureTimingJitterMs ?? partial.navcaptureTimingJitter ?? 0,
    ),
    authenticatedUiEvidence: partial.authenticatedUiEvidence === true,
    validForCapture: partial.validForCapture === true,
    blockingModalCount: Number(partial.blockingModalCount ?? 0),
    transactionActive: partial.transactionActive === true,
    deliveryPreflightInputForbidden: partial.deliveryPreflightInputForbidden === true,
    effectiveCommitNavigationMode: mode,
    softNavigationToShuffleAvailable: softAvailable,
    historyNavigationToShuffleAvailable: historyAvailable,
    nativeShellHardNavWouldNormallyApply: partial.nativeShellHardNavWouldNormallyApply === true,
    microSlideSoftOverrideApplies,
    microSlideHistoryOverrideApplies,
    microSlideCommitOverrideApplies,
    allowedCommitModeForMicroSlide,
    sourceTab: partial.sourceTab ?? "chats",
    destinationPath: partial.destinationPath ?? "/shuffle",
    targetProduction: partial.targetProduction === true,
    cleanClientController: partial.cleanClientController ?? null,
    deliveryVerifiedByLiveRelease: partial.deliveryVerifiedByLiveRelease === true,
    deliveryVerifiedBySwBypassClient: partial.deliveryVerifiedBySwBypassClient === true,
  };
}

function identitiesMatch(expected, runtime) {
  const exp = expected == null ? null : String(expected).trim();
  const run = runtime == null ? null : String(runtime).trim();
  if (!exp || !run) return false;
  if (exp === run) return true;
  return run.startsWith(exp) || exp.startsWith(run);
}

/**
 * Compare outer vs capture critical fields. Divergence → no input.
 */
export function compareOuterCaptureArmContexts(outer, capture) {
  const mismatches = [];
  for (const field of OUTER_CAPTURE_ARM_MATCH_FIELDS) {
    const a = outer?.[field];
    const b = capture?.[field];
    if (field === "runtimeBuildIdentity") {
      if (!identitiesMatch(a, b) && a !== b) mismatches.push(field);
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(field);
  }
  const match = mismatches.length === 0;
  return {
    OUTER_CAPTURE_ARM_CONTEXT_MATCH: match,
    mismatches,
    event: match ? null : "OUTER_CAPTURE_ARM_DIVERGENCE",
    pointerdownAllowed: false,
  };
}

/**
 * Args for evaluateProdTrueInputArm from a complete canonical context.
 * Never invents effectiveCommitNavigationMode.
 */
export function toEvaluateProdTrueInputArmArgs(context) {
  return {
    hostname: context.hostname,
    prodTrueActivationMode: context.prodTrueActivationMode,
    productionFlagTrueVerified: context.productionFlagTrueVerified,
    microSlideBuildFlag: context.microSlideBuildFlag,
    microSlideRuntimeEnabled: context.microSlideRuntimeEnabled,
    expectedBuildIdentity: context.expectedBuildIdentity,
    runtimeBuildIdentity: context.runtimeBuildIdentity,
    zeroJitter: context.zeroJitter,
    diagnosticTimingJitterActive: context.diagnosticTimingJitterActive,
    routeCommitDelayMs: context.routeCommitDelayMs,
    navcaptureTimingJitterMs: context.navcaptureTimingJitterMs,
    authenticatedUiEvidence: context.authenticatedUiEvidence,
    validForCapture: context.validForCapture,
    blockingModalCount: context.blockingModalCount,
    transactionActive: context.transactionActive,
    deliveryPreflightInputForbidden: context.deliveryPreflightInputForbidden,
    effectiveCommitNavigationMode: context.effectiveCommitNavigationMode,
  };
}

/**
 * Full arm pipeline: assert complete → evaluate → optionally compare outer.
 *
 * @returns {{
 *   PROD_TRUE_INPUT_ARMED: boolean,
 *   PROD_TRUE_INPUT_ARM_REJECTED: boolean,
 *   PROD_TRUE_ARM_CONTEXT_INCOMPLETE: boolean,
 *   OUTER_CAPTURE_ARM_DIVERGENCE: boolean,
 *   failedPredicates: string[],
 *   missingFields: string[],
 *   contextAssert: object,
 *   armEvaluation: object|null,
 *   consistency: object|null,
 *   pointerdownAllowed: boolean,
 * }}
 */
export function armProdTrueInputWithContext({
  context,
  evaluateProdTrueInputArm,
  outerContext = null,
  allowUnknownNavigationModeForDryRun = false,
} = {}) {
  const contextAssert = assertCompleteProdTrueArmContext(context, {
    allowUnknownNavigationModeForDryRun,
  });

  if (!contextAssert.complete) {
    return {
      PROD_TRUE_INPUT_ARMED: false,
      PROD_TRUE_INPUT_ARM_REJECTED: true,
      PROD_TRUE_ARM_CONTEXT_INCOMPLETE: true,
      OUTER_CAPTURE_ARM_DIVERGENCE: false,
      failedPredicates: ["PROD_TRUE_ARM_CONTEXT_INCOMPLETE"],
      missingFields: contextAssert.missingFields,
      contextAssert,
      armEvaluation: null,
      consistency: null,
      pointerdownAllowed: false,
      event: "PROD_TRUE_ARM_CONTEXT_INCOMPLETE",
    };
  }

  const armEvaluation = evaluateProdTrueInputArm(toEvaluateProdTrueInputArmArgs(context));
  let consistency = null;
  let divergence = false;

  if (outerContext) {
    consistency = compareOuterCaptureArmContexts(outerContext, context);
    divergence = consistency.OUTER_CAPTURE_ARM_CONTEXT_MATCH !== true;
  }

  const armed =
    armEvaluation.PROD_TRUE_INPUT_ARMED === true &&
    divergence !== true &&
    contextAssert.complete === true;

  return {
    PROD_TRUE_INPUT_ARMED: armed,
    PROD_TRUE_INPUT_ARM_REJECTED: !armed,
    PROD_TRUE_ARM_CONTEXT_INCOMPLETE: false,
    OUTER_CAPTURE_ARM_DIVERGENCE: divergence,
    failedPredicates: divergence
      ? ["OUTER_CAPTURE_ARM_DIVERGENCE", ...(armEvaluation.failedPredicates || [])]
      : armEvaluation.failedPredicates || [],
    missingFields: [],
    contextAssert,
    armEvaluation,
    consistency,
    pointerdownAllowed: armed,
    event: divergence
      ? "OUTER_CAPTURE_ARM_DIVERGENCE"
      : armEvaluation.PROD_TRUE_INPUT_ARMED
        ? null
        : "PROD_TRUE_INPUT_ARM_REJECTED",
  };
}

/**
 * Playwright page.evaluate collector for capture / dry-run.
 * Reads window.__getMainTabToShuffleCommitNavigationMode("/shuffle").
 */
export async function collectProdTrueArmContextFromPage(
  page,
  {
    sourceTab = "chats",
    destinationPath = "/shuffle",
    targetProduction = true,
    hostname = "",
    prodTrueActivationMode = true,
    productionFlagTrueVerified = false,
    expectedBuildIdentity = null,
    zeroJitter = true,
    diagnosticTimingJitterActive = false,
    routeCommitDelayMs = 0,
    navcaptureTimingJitterMs = 0,
    deliveryPreflightInputForbidden = false,
    deliveryVerifiedByLiveRelease = false,
    deliveryVerifiedBySwBypassClient = false,
  } = {},
) {
  const fromPage = await page.evaluate(async (dest) => {
    const validate = (await window.__authValidateSnapshot?.sample?.()) ?? null;
    const activation = window.__microSlideActivationExport?.() ?? null;
    const modeFn = window.__getMainTabToShuffleCommitNavigationMode;
    const mode = typeof modeFn === "function" ? modeFn(dest) : null;
    const trace =
      typeof window.__mainTabToShuffleTraceExport === "function"
        ? window.__mainTabToShuffleTraceExport()
        : [];
    const transactionActive = Array.isArray(trace)
      ? trace.some(
          (entry) =>
            entry?.activeTxPresent === true ||
            entry?.phase === "preparing" ||
            entry?.phase === "running" ||
            entry?.phase === "armed" ||
            entry?.phase === "sliding",
        )
      : false;

    const effective = mode?.effectiveCommitNavigationMode ?? null;
    return {
      microSlideBuildFlag: activation?.microSlideBuildFlag === true,
      microSlideRuntimeEnabled: activation?.microSlideRuntimeEnabled === true,
      runtimeBuildIdentity: activation?.buildSha ?? null,
      authenticatedUiEvidence:
        validate?.auth?.authenticatedUiEvidence === true ||
        location.pathname === "/chats" ||
        location.pathname === "/shuffle",
      validForCapture: validate?.validForCapture !== false,
      blockingModalCount: validate?.modals?.blocking?.length ?? 0,
      transactionActive,
      pathname: location.pathname,
      serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
      serviceWorkerScriptUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      effectiveCommitNavigationMode: effective,
      softNavigationToShuffleAvailable: effective === "soft",
      historyNavigationToShuffleAvailable: effective === "history",
      nativeShellHardNavWouldNormallyApply: mode?.nativeShellHardNavWouldNormallyApply === true,
      microSlideSoftOverrideApplies: mode?.microSlideSoftOverrideApplies === true,
      microSlideHistoryOverrideApplies: mode?.microSlideHistoryOverrideApplies === true,
      microSlideCommitOverrideApplies: mode?.microSlideCommitOverrideApplies === true,
      allowedCommitModeForMicroSlide: mode?.allowedCommitModeForMicroSlide ?? null,
      commitNavigationModeRaw: mode,
    };
  }, destinationPath);

  return buildProdTrueArmContext({
    hostname,
    prodTrueActivationMode,
    productionFlagTrueVerified,
    microSlideBuildFlag: fromPage.microSlideBuildFlag,
    microSlideRuntimeEnabled: fromPage.microSlideRuntimeEnabled,
    expectedBuildIdentity,
    runtimeBuildIdentity: fromPage.runtimeBuildIdentity,
    zeroJitter,
    diagnosticTimingJitterActive,
    routeCommitDelayMs,
    navcaptureTimingJitterMs,
    authenticatedUiEvidence: fromPage.authenticatedUiEvidence,
    validForCapture: fromPage.validForCapture,
    blockingModalCount: fromPage.blockingModalCount,
    transactionActive: fromPage.transactionActive,
    deliveryPreflightInputForbidden,
    effectiveCommitNavigationMode: fromPage.effectiveCommitNavigationMode,
    softNavigationToShuffleAvailable: fromPage.softNavigationToShuffleAvailable,
    historyNavigationToShuffleAvailable: fromPage.historyNavigationToShuffleAvailable,
    nativeShellHardNavWouldNormallyApply: fromPage.nativeShellHardNavWouldNormallyApply,
    microSlideSoftOverrideApplies: fromPage.microSlideSoftOverrideApplies,
    microSlideHistoryOverrideApplies: fromPage.microSlideHistoryOverrideApplies,
    microSlideCommitOverrideApplies: fromPage.microSlideCommitOverrideApplies,
    allowedCommitModeForMicroSlide: fromPage.allowedCommitModeForMicroSlide,
    sourceTab,
    destinationPath,
    targetProduction,
    cleanClientController: fromPage.serviceWorkerController,
    deliveryVerifiedByLiveRelease,
    deliveryVerifiedBySwBypassClient,
    _pageExtras: fromPage,
  });
}
