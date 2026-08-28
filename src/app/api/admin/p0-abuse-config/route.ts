import { abuseIpRuntimeReady } from "@/lib/abuse/abuseIpHash";
import { IP_TRUST_TOPOLOGY_NOTE } from "@/lib/abuse/abuseIpTrustProbeShared";
import { adminPrivateJson, adminPrivatePreflight } from "@/lib/admin/adminPrivateApi";
import {
  p0DiagStrictAuthErrorBody,
  mapP0DiagStrictRouteError,
  verifyAdminIdTokenStrictForP0Diag,
} from "@/lib/admin/verifyAdminP0DiagStrict";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return adminPrivatePreflight(req);
}

export async function GET(req: Request) {
  try {
    await verifyAdminIdTokenStrictForP0Diag(req);
  } catch (error) {
    const mapped = mapP0DiagStrictRouteError(error);
    return adminPrivateJson(req, mapped.body, mapped.status);
  }

  return adminPrivateJson(req, {
    ok: true,
    gate: "P0_ABUSE_CONFIG",
    secretConfigured: abuseIpRuntimeReady().secretConfigured,
    ipTrust: {
      mode: "direct_gcf_last_xff_hop_only",
      hostingRewriteTrusted: false,
      topologyNote: IP_TRUST_TOPOLOGY_NOTE,
    },
    activateGates: false,
    activateRules: false,
    note: "Config metadata only — run IP trust probes from Admin/Sistema.",
  });
}
