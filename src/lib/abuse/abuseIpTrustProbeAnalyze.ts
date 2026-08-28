import { createHmac } from "node:crypto";

import {
  canonicalizeIp,
  getTrustedRequestClientIp,
  hashAbuseClientIp,
  isDirectCloudFunctionsRequest,
  abuseIpHashSecret,
} from "@/lib/abuse/abuseIpHash";
import {
  IP_TRUST_TOPOLOGY_NOTE,
  type IpTrustHeaderAnalysis,
  type IpTrustHopAnalysis,
} from "@/lib/abuse/abuseIpTrustProbeShared";

function fingerprintOpaqueHeader(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return createHmac("sha256", abuseIpHashSecret())
      .update(`abuse-header-v1:${raw.slice(0, 200)}`)
      .digest("hex");
  } catch {
    return "";
  }
}

function fingerprintHop(raw: string): string {
  const canonical = canonicalizeIp(raw);
  if (!canonical) return "";
  try {
    return hashAbuseClientIp(canonical);
  } catch {
    return "";
  }
}

/** Server-only: HMAC hop fingerprints for an incoming request (no raw IPs). */
export function analyzeIpTrustHeaders(req: Request): IpTrustHeaderAnalysis {
  const forwarded = String(req.headers.get("x-forwarded-for") || "").trim();
  const hops = forwarded
    ? forwarded.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
  const hopFingerprints = hops
    .map((hop, hopIndex) => {
      const fingerprint = fingerprintHop(hop);
      if (!fingerprint) return null;
      return { hopIndex, fingerprint };
    })
    .filter((row): row is IpTrustHopAnalysis => Boolean(row));

  const trusted = getTrustedRequestClientIp(req);
  const selectedFingerprint = trusted ? fingerprintHop(trusted) : null;
  const xReal = String(req.headers.get("x-real-ip") || "").trim();
  const xRealIpFingerprint = xReal ? fingerprintHop(xReal) || null : null;
  const forwardedHeader = String(req.headers.get("forwarded") || "").trim();
  const forwardedHeaderFingerprint = forwardedHeader
    ? fingerprintOpaqueHeader(forwardedHeader)
    : null;

  return {
    gate: "P0_IP_TRUST_ANALYSIS",
    requestHost: String(req.headers.get("host") || "").trim() || null,
    requestIsDirectGcf: isDirectCloudFunctionsRequest(req),
    hostingRewriteTrusted: false,
    forwardedPresent: Boolean(forwarded),
    forwardedHopCount: hops.length,
    hopFingerprints,
    xRealIpFingerprint,
    forwardedHeaderFingerprint,
    selectedFingerprint,
    selectedPolicy: selectedFingerprint ? "last_public_hop_direct_gcf" : "none",
    topologyNote: IP_TRUST_TOPOLOGY_NOTE,
    activateGates: false,
  };
}
