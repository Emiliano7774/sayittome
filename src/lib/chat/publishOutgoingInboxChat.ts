import type { InboxChat } from "@/hooks/useChatsInbox";
import { hasInboxActivity } from "@/lib/chat/inboxShellGuard";
import { readInboxSnapshot, writeInboxSnapshot } from "@/lib/chat/inboxSnapshot";
import { registerSessionChat } from "@/lib/chat/sessionChats";

export const OUTGOING_INBOX_CHAT_EVENT = "sayittome-outgoing-inbox-chat";

/**
 * Make a just-sent thread visible in Chats immediately — before the session
 * snapshot listener / anon recovery catch up. Requires a non-empty lastMessage
 * (empty shells stay filtered by isVisibleInboxChat).
 */
export function publishOutgoingInboxChat(chat: InboxChat) {
  const id = String(chat.canonicalChatId || chat.id || "").trim();
  if (!id || !hasInboxActivity(chat)) return;

  const row: InboxChat = {
    ...chat,
    id,
    canonicalChatId: String(chat.canonicalChatId || id),
  };

  registerSessionChat(id);

  const previous = readInboxSnapshot();
  const without = previous.filter(
    (entry) => entry.id !== id && entry.canonicalChatId !== id,
  );
  writeInboxSnapshot([row, ...without]);

  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OUTGOING_INBOX_CHAT_EVENT, { detail: { chat: row } }),
  );
}

export function buildOutgoingInboxChatRow(input: {
  chatId: string;
  username: string;
  targetUid: string;
  senderId: string;
  lastMessage: string;
  targetPhoto?: string;
  latestMessageId?: string;
  nowMs?: number;
}): InboxChat | null {
  const chatId = String(input.chatId || "").trim();
  const lastMessage = String(input.lastMessage || "").trim();
  const username = String(input.username || "").trim();
  const targetUid = String(input.targetUid || "").trim();
  const senderId = String(input.senderId || "").trim();
  if (!chatId || !lastMessage) return null;

  const nowMs = Number(input.nowMs || Date.now());
  const stamp = { toMillis: () => nowMs };

  return {
    id: chatId,
    canonicalChatId: chatId,
    ...(username
      ? { targetUsername: username, receptorUsername: username }
      : {}),
    ...(targetUid
      ? {
          targetUid,
          receptorUid: targetUid,
          anonOwnerUid: targetUid,
        }
      : {}),
    ...(senderId ? { anonSessionId: senderId, lastMessageSender: senderId } : {}),
    ...(input.targetPhoto ? { targetPhoto: input.targetPhoto } : {}),
    ...(input.latestMessageId
      ? { latestMessageId: input.latestMessageId }
      : {}),
    lastMessage,
    latestSenderKind: "anon",
    updatedAt: stamp,
    lastMessageAt: stamp,
    participantes: [senderId, targetUid].filter(Boolean),
    createdAtMs: nowMs,
  };
}
