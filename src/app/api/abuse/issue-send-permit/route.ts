import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { issueAbuseSendPermit } from "@/lib/abuse/profileAnonAbuseBlockWrite";
import { abuseCorsPreflight, abuseJson } from "@/lib/abuse/abuseCors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return abuseCorsPreflight(req);
}

/**
 * One-shot send permit bound to messageId. Requires existing lease + trusted IP.
 */
export async function POST(req: Request) {
  let visitor;
  try {
    visitor = await verifyFirebaseIdTokenAllowingAnonymous(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return abuseJson(
      req,
      { ok: false, error: String((error as Error)?.message || "unauthorized") },
      { status },
    );
  }

  let body: {
    receptorUid?: string;
    chatId?: string;
    messageId?: string;
  };
  try {
    body = (await req.json()) as {
      receptorUid?: string;
      chatId?: string;
      messageId?: string;
    };
  } catch {
    return abuseJson(req, { ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await issueAbuseSendPermit({
    visitorAuthUid: visitor.uid,
    chatId: String(body.chatId || "").trim(),
    receptorUid: String(body.receptorUid || "").trim(),
    messageId: String(body.messageId || "").trim(),
    req,
  });

  if (!result.ok) {
    return abuseJson(
      req,
      {
        ok: false,
        error: result.error,
        blocked: Boolean(result.blocked),
        requireNewEpoch: result.error === "legacy_unbound",
      },
      { status: result.status },
    );
  }

  return abuseJson(req, {
    ok: true,
    permitId: result.permitId,
    expiresAtMs: result.expiresAtMs,
    ipCoverage: result.ipCoverage,
  });
}
