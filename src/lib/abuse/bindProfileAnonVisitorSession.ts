/**
 * Bind visitor auth → private chat lease (server-atomic create when chat missing).
 * Uses live anon for epoch switch — rotates session only once if server requires new epoch.
 */
import { auth } from "@/lib/firebase";
import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { abuseApiUrl } from "@/lib/abuse/abuseApiBase";
import { resolveSendChatIdForLiveAnon } from "@/lib/abuse/profileAnonAbuseBlock";
import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { rotateAnonSessionPreserving } from "@/lib/chat/anonSession";
import { registerSessionChat } from "@/lib/chat/sessionChats";

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
  let chatId = resolved.chatId;
  let epochSwitched = resolved.epochSwitched;

  async function postBind(targetChatId: string) {
    const res = await fetch(abuseApiUrl("/api/abuse/bind-visitor-session"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ receptorUid, chatId: targetChatId, username }),
      cache: "no-store",
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

  let { res, json } = await postBind(chatId);
  if (res.ok && json?.ok && json.chatId) {
    registerSessionChat(json.chatId);
    return {
      chatId: String(json.chatId),
      created: Boolean(json.created),
      rotated: epochSwitched,
    };
  }

  if (
    json?.requireNewEpoch ||
    json?.error === "legacy_unbound" ||
    json?.error === "foreign_lease" ||
    json?.error === "foreign_anon_alias"
  ) {
    // Server rejected: mint ONE fresh anon session and retry (never double-rotate live).
    const { next } = rotateAnonSessionPreserving();
    const nextChatId = buildProfileAnonChatId(next, username);
    if (!nextChatId || nextChatId === chatId) {
      throw Object.assign(new Error("epoch_rotate_failed"), { status: 409 });
    }
    chatId = nextChatId;
    epochSwitched = true;
    ({ res, json } = await postBind(chatId));
    if (res.ok && json?.ok && json.chatId) {
      registerSessionChat(json.chatId);
      return {
        chatId: String(json.chatId),
        created: Boolean(json.created),
        rotated: true,
      };
    }
  }

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
