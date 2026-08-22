import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export async function handleAdminUserChatsGet(req: Request): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return { status: mapped.status, body: { ok: false, error: mapped.error } };
  }

  try {
    const url = new URL(req.url);
    const username = decodeURIComponent(String(url.searchParams.get("username") || "")).trim();

    if (!username) {
      return { status: 400, body: { ok: false, error: "username required" } };
    }

    const { fetchAllModerationChatsForUser } = await import("@/lib/moderation/fetchUserChats");
    const result = await fetchAllModerationChatsForUser(username);

    return {
      status: 200,
      body: {
        ok: true,
        username,
        uid: result.uid,
        chats: result.chats,
        total: result.chats.length,
        scanned: result.scanned,
      },
    };
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    if (status === 409) return { status: 409, body: { ok: false, error: "username_not_unique" } };
    if (status === 503) return { status: 503, body: { ok: false, error: "unavailable" } };
    return { status: 500, body: { ok: false, error: "error" } };
  }
}
