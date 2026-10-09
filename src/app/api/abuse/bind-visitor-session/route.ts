import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { bindVisitorChatLease } from "@/lib/abuse/profileAnonAbuseBlockWrite";
import { abuseCorsPreflight, abuseJson } from "@/lib/abuse/abuseCors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return abuseCorsPreflight(req);
}

/**
 * Server-issued visitor↔chat binding BEFORE client may create the chat doc.
 * Resolves profile by username server-side. Requires trusted direct-GCF IP.
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

  let body: { receptorUid?: string; chatId?: string; username?: string };
  try {
    body = (await req.json()) as {
      receptorUid?: string;
      chatId?: string;
      username?: string;
    };
  } catch {
    return abuseJson(req, { ok: false, error: "invalid_json" }, { status: 400 });
  }

  const username = String(body.username || "").trim();
  if (!username) {
    return abuseJson(req, { ok: false, error: "missing_username" }, { status: 400 });
  }

  let result;
  try {
    result = await bindVisitorChatLease({
      visitorAuthUid: visitor.uid,
      chatId: String(body.chatId || "").trim(),
      receptorUid: String(body.receptorUid || "").trim() || undefined,
      username,
      req,
    });
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    return abuseJson(
      req,
      { ok: false, error: String((error as Error)?.message || "bind_failed") },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }

  if (!result.ok) {
    return abuseJson(
      req,
      {
        ok: false,
        error: result.error,
        requireNewEpoch: Boolean(result.requireNewEpoch),
        reason: result.reason || result.error,
      },
      { status: result.status },
    );
  }

  return abuseJson(req, {
    ok: true,
    chatId: result.chatId,
    bound: true,
    created: result.created,
    receptorUid: result.receptorUid,
    username: result.username,
  });
}
