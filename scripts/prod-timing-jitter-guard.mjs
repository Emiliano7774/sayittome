/**
 * Pure mayInjectDiagnosticTimingJitter — mirrored for Node harnesses.
 * PRODUCTION hosts always forbid timing injection.
 */

export function mayInjectDiagnosticTimingJitter(hostname, explicitEnable) {
  const host = String(hostname || "");
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  return explicitEnable === true;
}

export function shouldRunnerInjectBridgeDiagJitter({
  hostname,
  releaseMode = false,
  enableMicroSlide = false,
  runnerTrace = false,
  navcapture = false,
  explicitJitterFlag = false,
}) {
  if (!mayInjectDiagnosticTimingJitter(hostname, explicitJitterFlag)) return false;
  return Boolean(releaseMode && enableMicroSlide);
}

export function buildDiagnosticTimingJitterReport({
  hostname,
  explicitJitterFlag = false,
  routeCommitDelayMs = 0,
  finalDomReadinessDelayMs = 0,
}) {
  const allowed = mayInjectDiagnosticTimingJitter(hostname, explicitJitterFlag);
  const enabled = allowed && (routeCommitDelayMs > 0 || finalDomReadinessDelayMs > 0);
  return {
    diagnosticTimingJitterEnabled: enabled,
    routeCommitDelayMs: enabled ? routeCommitDelayMs : 0,
    finalRouteDomDelayMs: enabled ? finalDomReadinessDelayMs : 0,
    jitterSource: enabled ? "sessionStorage:sayittome:post-settle-bridge-diag-jitter" : null,
    PRODUCTION_RELEASE_CAPTURE_MUST_NOT_INJECT_TIMING_JITTER: true,
  };
}
