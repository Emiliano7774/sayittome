import { NextResponse } from "next/server";

import { abuseIpRuntimeReady, isDirectCloudFunctionsRequest } from "@/lib/abuse/abuseIpHash";
import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/**
 * Read-only P0 abuse config diagnostic for admin.
 * Never returns secret values, IP hashes, or client identifiers.
 */
export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return privateJson(
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      status,
    );
  }

  const host = String(req.headers.get("host") || "").trim();
  const directGcfPath = isDirectCloudFunctionsRequest(req);

  return privateJson({
    ok: true,
    gate: "P0_ABUSE_CONFIG",
    secretConfigured: abuseIpRuntimeReady().secretConfigured,
    ipTrust: {
      mode: "direct_gcf_last_xff_hop_only",
      requestHost: host || null,
      requestIsDirectGcf: directGcfPath,
      hostingRewriteTrusted: false,
    },
    activateGates: false,
    activateRules: false,
    note: "Diagnostic only — gates/rules remain off until direct GCF IP validation passes.",
  });
}
