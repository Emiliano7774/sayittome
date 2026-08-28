import { analyzeIpTrustHeaders } from "@/lib/abuse/abuseIpTrustProbeAnalyze";
import { adminPrivateJson, adminPrivatePreflight } from "@/lib/admin/adminPrivateApi";
import {
  mapP0DiagStrictRouteError,
  verifyAdminIdTokenStrictForP0Diag,
} from "@/lib/admin/verifyAdminP0DiagStrict";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return adminPrivatePreflight(req);
}

/** Admin-only echo: hop fingerprints for the incoming request (no raw IPs). */
export async function GET(req: Request) {
  try {
    await verifyAdminIdTokenStrictForP0Diag(req);
  } catch (error) {
    const mapped = mapP0DiagStrictRouteError(error);
    return adminPrivateJson(req, mapped.body, mapped.status);
  }

  return adminPrivateJson(req, {
    ok: true,
    analysis: analyzeIpTrustHeaders(req),
  });
}
