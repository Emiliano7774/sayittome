/**
 * Local-only diagnostic jitter for post-settle route bridge validation.
 *
 * HARD RULE: mayInjectDiagnosticTimingJitter() is true ONLY when
 * hostname is localhost/127.0.0.1 AND an explicit enable key is set.
 * Production hosts (e.g. sayittome-app.web.app) ALWAYS return false —
 * including --release, --runner-trace, navcapture, localStorage diagnostics.
 */

export const JITTER_SESSION_KEY = "sayittome:post-settle-bridge-diag-jitter";
export const JITTER_EXPLICIT_ENABLE_KEY = "sayittome:post-settle-bridge-diag-jitter-enabled";

export type PostSettleBridgeDiagJitter = {
  routeCommitDelayMs: number;
  finalDomReadinessDelayMs: number;
  hopNum?: number;
};

let shuffleRouteCommittedAtMono: number | null = null;

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function hostnameNow() {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

/** Canonical tooling gate — production must never inject timing. */
export function mayInjectDiagnosticTimingJitter(
  hostname = hostnameNow(),
  explicitEnable:
    | boolean
    | null
    | undefined = typeof window !== "undefined"
      ? (() => {
          try {
            return window.sessionStorage.getItem(JITTER_EXPLICIT_ENABLE_KEY) === "1";
          } catch {
            return false;
          }
        })()
      : false,
): boolean {
  const host = String(hostname || "");
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  return explicitEnable === true;
}

export function readPostSettleBridgeDiagJitter(): PostSettleBridgeDiagJitter | null {
  if (typeof window === "undefined") return null;
  if (!mayInjectDiagnosticTimingJitter()) return null;
  try {
    const raw = window.sessionStorage.getItem(JITTER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PostSettleBridgeDiagJitter;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      routeCommitDelayMs: Math.max(0, Number(parsed.routeCommitDelayMs) || 0),
      finalDomReadinessDelayMs: Math.max(0, Number(parsed.finalDomReadinessDelayMs) || 0),
      hopNum: parsed.hopNum,
    };
  } catch {
    return null;
  }
}

export function setPostSettleBridgeDiagJitter(jitter: PostSettleBridgeDiagJitter) {
  if (typeof window === "undefined") return;
  if (!mayInjectDiagnosticTimingJitter()) return;
  try {
    window.sessionStorage.setItem(JITTER_SESSION_KEY, JSON.stringify(jitter));
  } catch {
    /* ignore */
  }
}

export function clearPostSettleBridgeDiagJitter() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(JITTER_SESSION_KEY);
    window.sessionStorage.removeItem(JITTER_EXPLICIT_ENABLE_KEY);
  } catch {
    /* ignore */
  }
  resetShuffleRouteCommittedMarker();
}

export function resetShuffleRouteCommittedMarker() {
  shuffleRouteCommittedAtMono = null;
}

export function markShuffleRouteCommittedNow() {
  if (shuffleRouteCommittedAtMono === null) {
    shuffleRouteCommittedAtMono = monoMs();
  }
}

export function getShuffleRouteCommittedAtMono() {
  return shuffleRouteCommittedAtMono;
}

export function isFinalDomReadinessJitterBlocking() {
  if (!mayInjectDiagnosticTimingJitter()) return false;
  const jitter = readPostSettleBridgeDiagJitter();
  if (!jitter?.finalDomReadinessDelayMs) return false;
  if (shuffleRouteCommittedAtMono === null) return false;
  return monoMs() - shuffleRouteCommittedAtMono < jitter.finalDomReadinessDelayMs;
}

export function getPostSettleBridgeRouteCommitDelayMs() {
  if (!mayInjectDiagnosticTimingJitter()) return 0;
  return readPostSettleBridgeDiagJitter()?.routeCommitDelayMs ?? 0;
}

export function exportDiagnosticTimingJitterReport() {
  const allowed = mayInjectDiagnosticTimingJitter();
  const jitter = allowed ? readPostSettleBridgeDiagJitter() : null;
  return {
    diagnosticTimingJitterEnabled: allowed && Boolean(jitter),
    routeCommitDelayMs: allowed ? jitter?.routeCommitDelayMs ?? 0 : 0,
    finalRouteDomDelayMs: allowed ? jitter?.finalDomReadinessDelayMs ?? 0 : 0,
    jitterSource:
      allowed && jitter
        ? "sessionStorage:sayittome:post-settle-bridge-diag-jitter"
        : null,
    PRODUCTION_RELEASE_CAPTURE_MUST_NOT_INJECT_TIMING_JITTER: true,
  };
}
