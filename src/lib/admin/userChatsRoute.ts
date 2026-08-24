import {
  mapAdminUserChatsFailure,
  parseAdminUsernameQueryParam,
} from "@/lib/admin/adminUsernameParam";
import { mapAdminAuthFailure, verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";

export async function handleAdminUserChatsGet(req: Request): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    console.error("admin_user_chats_auth_failed", {
      status: mapped.status,
      error: mapped.error,
    });
    return { status: mapped.status, body: { ok: false, error: mapped.error } };
  }

  try {
    const url = new URL(req.url);
    // Never double-decode: searchParams.get already yields the decoded username.
    const username = parseAdminUsernameQueryParam(url.searchParams.get("username"));

    if (!username) {
      return { status: 400, body: { ok: false, error: "username_required" } };
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
    const mapped = mapAdminUserChatsFailure(error);
    console.error("admin_user_chats_failed", {
      status: mapped.status,
      error: mapped.error,
      detail: String((error as Error)?.message || ""),
    });
    return {
      status: mapped.status,
      body: {
        ok: false,
        error: mapped.error,
        ...(mapped.detail ? { detail: mapped.detail } : {}),
      },
    };
  }
}
