/**
 * Bind visitor auth → private chat lease (server-atomic create when chat missing).
 * Never rotate a live anonymous identity in response to a chat bind failure:
 * only an explicit session reset/logout can change it.
 */
import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { fetchAbuseApi } from "@/lib/abuse/abuseApiBase";
import { resolveSendChatIdForLiveAnon } from "@/lib/abuse/profileAnonAbuseBlock";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";

export async function bindProfileAnonVisitorSession(input: {
  receptorUid: string;
  chatId: string;
  username: string;
}): Promise<{ chatId: string; created: boolean; rotated: boolean }> {
  const receptorUid = String(input.receptorUid || "").trim();
  const username = String(input.username || "").trim();
  if (!receptorUid || !username) throw new Error("missing_fields");

  const user = await ensureStorageAuth({ allowAnonymous: true });
  const idToken = await user.getIdToken();

  const live = getChatAnonSenderId();
  const resolved = resolveSendChatIdForLiveAnon({
    chatId: String(input.chatId || "").trim(),
    username,
    liveAnonId: live,
  });
  const chatId = resolved.chatId;
  const epochSwitched = resolved.epochSwitched;

  async function postBind(targetChatId: string) {
    const res = await fetchAbuseApi("/api/abuse/bind-visitor-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ receptorUid, chatId: targetChatId, username }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      chatId?: string;
      created?: boolean;
      error?: string;
      requireNewEpoch?: boolean;
      receptorUid?: string;
    };
    return { res, json };
  }

  const { res, json } = await postBind(chatId);
  if (res.ok && json?.ok && json.chatId) {
    return {
      chatId: String(json.chatId),
      created: Boolean(json.created),
      rotated: epochSwitched,
    };
  }

  // A foreign/legacy lease is a 409 conflict, not permission to impersonate
  // another anonymous identity. Preserve this live session and let callers
  // surface the rejection instead of silently changing the anon for ALL chats.

  const err = new Error(String(json?.error || "bind_failed")) as Error & {
    status?: number;
    requireNewEpoch?: boolean;
  };
  err.status = res.status;
  err.requireNewEpoch = Boolean(json?.requireNewEpoch);
  throw err;
}

/** Ensure send path uses live anon epoch before upload/optimistic writes. */
export async function ensureProfileAnonSendEpoch(input: {
  receptorUid: string;
  chatId: string;
  username: string;
}): Promise<{ chatId: string; rotated: boolean }> {
  const bound = await bindProfileAnonVisitorSession(input);
  return { chatId: bound.chatId, rotated: bound.rotated };
}
