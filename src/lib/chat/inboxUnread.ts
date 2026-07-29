import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { isIncomingChatActivity, wasChatReadOnServer } from "@/lib/chat/incomingChatActivity";
import {
  isIncomingAnonChatForOwner,
  profileAnonSenderFromChat,
  resolveChatViewerId,
} from "@/lib/chat/inboxPeerTitle";
import { wasChatReadLocally } from "@/lib/chat/localChatRead";

export function resolveInboxViewerId(uid: string) {
  return uid || getChatAnonSenderId();
}

type UnreadCountOptions = {
  firebaseUid?: string;
  excludeChatId?: string;
};

function isExcludedChat(chat: InboxChat, excludeChatId?: string) {
  if (!excludeChatId) return false;
  const chatKey = chat.canonicalChatId || chat.id;
  return excludeChatId === chatKey || excludeChatId === chat.id;
}

/** Returns 1 if the chat has pending incoming activity, else 0 (no numeric badges). */
export function chatUnreadCount(
  chat: InboxChat,
  viewerId: string,
  options: UnreadCountOptions = {},
) {
  if (!viewerId) return 0;
  if (isExcludedChat(chat, options.excludeChatId)) return 0;

  const firebaseUid = options.firebaseUid || "";

  if (wasChatReadOnServer(chat, viewerId, firebaseUid)) return 0;
  if (wasChatReadLocally(chat, viewerId, firebaseUid)) return 0;

  if (!isIncomingChatActivity(chat, viewerId, firebaseUid)) return 0;

  return 1;
}

export function chatUnreadCountForViewer(
  chat: InboxChat,
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
  let viewerId = resolveChatViewerId(chat, firebaseUid);
  const liveAnon = getChatAnonSenderId();
  const threadAnon = profileAnonSenderFromChat(chat);
  // Prefer the chatId / thread visitor for unread keys. A regenerated live
  // session must not steal evaluation away from unreadCounts[threadAnon]
  // written by profile→anon replies (manual QA: badge/row missing).
  if (liveAnon.startsWith("anon_") && !isIncomingAnonChatForOwner(chat, firebaseUid)) {
    const members = chat.participantes || [];
    const hasUnreadSignal = (id: string) => {
      if (!id.startsWith("anon_")) return false;
      const unread = chat.unreadCounts?.[id];
      if (typeof unread === "number" && unread > 0) return true;
      return chat.readBy?.[id] === false;
    };
    if (hasUnreadSignal(threadAnon)) {
      viewerId = threadAnon;
    } else if (hasUnreadSignal(liveAnon)) {
      viewerId = liveAnon;
    } else if (
      members.includes(liveAnon) ||
      viewerId === liveAnon ||
      threadAnon === liveAnon
    ) {
      // Stable key = chatId visitor when present; never prefer live over thread
      // just because both appear in participantes.
      viewerId = threadAnon.startsWith("anon_") ? threadAnon : liveAnon;
    }
  }
  return chatUnreadCount(chat, viewerId, { ...options, firebaseUid });
}

export function totalUnreadCount(
  chats: InboxChat[],
  firebaseUid = "",
  options: Omit<UnreadCountOptions, "firebaseUid"> = {},
) {
  return chats.reduce(
    (sum, chat) => sum + chatUnreadCountForViewer(chat, firebaseUid, options),
    0,
  );
}
