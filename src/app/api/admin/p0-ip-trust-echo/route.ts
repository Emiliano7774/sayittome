import { analyzeIpTrustHeaders } from "@/lib/abuse/abuseIpTrustProbeAnalyze";
import { adminPrivateJson, adminPrivatePreflight } from "@/lib/admin/adminPrivateApi";
import {
  p0DiagStrictAuthErrorBody,
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
    const status = Number((error as { status?: number })?.status || 401);
    return adminPrivateJson(req, p0DiagStrictAuthErrorBody(status), status);
  }

  return adminPrivateJson(req, {
    ok: true,
    analysis: analyzeIpTrustHeaders(req),
  });
}
