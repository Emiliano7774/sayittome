/** Client-safe IP trust probe types/constants — no Node crypto or secrets. */

export const P0_IP_TRUST_PROBE_TIMEOUT_MS = 12_000;

export const SPOOF_LEFT_PUBLIC_FINGERPRINT_TEST_IP = "203.0.113.99";

export const P0_DIRECT_SSR_DEFAULT_BASE =
  "https://us-central1-sayittome-app.cloudfunctions.net/ssrsayittomeapp";

export const IP_TRUST_TOPOLOGY_NOTE =
  "Google HTTPS LB may append client,LB to X-Forwarded-For; the last hop is not a guaranteed client IP. See cloud.google.com/load-balancing/docs/https#x-forwarded-for_header.";

export type IpTrustHopAnalysis = {
  hopIndex: number;
  fingerprint: string;
};

export type IpTrustHeaderAnalysis = {
  gate: "P0_IP_TRUST_ANALYSIS";
  requestHost: string | null;
  requestIsDirectGcf: boolean;
  hostingRewriteTrusted: false;
  forwardedPresent: boolean;
  forwardedHopCount: number;
  hopFingerprints: IpTrustHopAnalysis[];
  xRealIpFingerprint: string | null;
  forwardedHeaderFingerprint: string | null;
  selectedFingerprint: string | null;
  selectedPolicy: "last_public_hop_direct_gcf" | "none";
  topologyNote: string;
  activateGates: false;
};

export type IpTrustProbeScenario =
  | "baseline"
  | "spoof_xff_left_public"
  | "spoof_xff_client_only"
  | "spoof_x_real_ip"
  | "spoof_forwarded";

export function buildSpoofHeadersForScenario(
  scenario: IpTrustProbeScenario,
): Record<string, string> {
  switch (scenario) {
    case "spoof_xff_left_public":
      return { "x-forwarded-for": "203.0.113.99, 198.51.100.55" };
    case "spoof_xff_client_only":
      return { "x-forwarded-for": "203.0.113.99" };
    case "spoof_x_real_ip":
      return { "x-real-ip": "203.0.113.99" };
    case "spoof_forwarded":
      return { forwarded: "for=203.0.113.99;proto=https" };
    default:
      return {};
  }
}

export function resolveDirectSsrBaseUrl(): string {
  const publicBase = String(
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_P0_DIRECT_SSR_BASE_URL) || "",
  ).trim();
  if (publicBase) return publicBase.replace(/\/$/, "");

  const serverBase = String(
    (typeof process !== "undefined" && process.env?.P0_DIRECT_SSR_BASE_URL) || "",
  ).trim();
  if (serverBase) return serverBase.replace(/\/$/, "");

  return P0_DIRECT_SSR_DEFAULT_BASE;
}

export function isProbeHttpSuccess(status: number) {
  return status >= 200 && status < 300;
}

export type IpTrustFingerprintCompare = {
  sameSelectedFingerprint: boolean;
  forgedLeftHopIgnored: boolean | null;
  baselineSelected: string | null;
  probeSelected: string | null;
  baselineHopCount: number;
  probeHopCount: number;
} | null;

function resolveSpoofLeftFingerprint(
  probe: IpTrustHeaderAnalysis,
  options?: { spoofLeftFingerprint?: string },
): string | null {
  if (options?.spoofLeftFingerprint) return options.spoofLeftFingerprint;
  const leftHop = probe.hopFingerprints.find((hop) => hop.hopIndex === 0);
  return leftHop?.fingerprint || null;
}

/** Returns null when either side lacks selectedFingerprint — never infer forgedIgnored from null. */
export function compareIpTrustFingerprints(
  baseline: IpTrustHeaderAnalysis | null | undefined,
  probe: IpTrustHeaderAnalysis | null | undefined,
  options?: { spoofLeftFingerprint?: string },
): IpTrustFingerprintCompare {
  if (!baseline?.selectedFingerprint || !probe?.selectedFingerprint) {
    return null;
  }
  const spoofLeft = resolveSpoofLeftFingerprint(probe, options);
  const forgedLeftHopIgnored = spoofLeft ? probe.selectedFingerprint !== spoofLeft : null;
  return {
    sameSelectedFingerprint: baseline.selectedFingerprint === probe.selectedFingerprint,
    forgedLeftHopIgnored,
    baselineSelected: baseline.selectedFingerprint,
    probeSelected: probe.selectedFingerprint,
    baselineHopCount: baseline.forwardedHopCount,
    probeHopCount: probe.forwardedHopCount,
  };
}

export type CrossPathBaselineInterpretation = {
  crossPathSameSelected: boolean | null;
  clientSelected: string | null;
  serverSelected: string | null;
  physicalPassHint:
    | "PENDING_incomplete_probe"
    | "SUSPICIOUS_same_selected_may_be_proxy_not_client_ip"
    | "client_and_server_differ_expected_for_real_client";
};

/** Same selected on browser vs server baselines may indicate proxy — NOT physical PASS. */
export function interpretCrossPathBaselines(input: {
  clientBaseline: { selectedFingerprint?: string | null } | null | undefined;
  serverBaseline: { selectedFingerprint?: string | null } | null | undefined;
}): CrossPathBaselineInterpretation {
  const clientSelected = input.clientBaseline?.selectedFingerprint || null;
  const serverSelected = input.serverBaseline?.selectedFingerprint || null;
  if (!clientSelected || !serverSelected) {
    return {
      crossPathSameSelected: null,
      clientSelected,
      serverSelected,
      physicalPassHint: "PENDING_incomplete_probe",
    };
  }
  const same = clientSelected === serverSelected;
  return {
    crossPathSameSelected: same,
    clientSelected,
    serverSelected,
    physicalPassHint: same
      ? "SUSPICIOUS_same_selected_may_be_proxy_not_client_ip"
      : "client_and_server_differ_expected_for_real_client",
  };
}
