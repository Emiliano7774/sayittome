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
  const primaryViewerId = resolveChatViewerId(chat, firebaseUid);
  const liveAnon = getChatAnonSenderId();
  const threadAnon = profileAnonSenderFromChat(chat);
  const candidates = new Set<string>();
  if (primaryViewerId) candidates.add(primaryViewerId);

  // Union evaluation for anon visitors: profile replies may dirtied chatId
  // visitor, live session, or a poisoned historical key. Any positive unread
  // signal must surface badge + bold row (manual QA override 3).
  if (!isIncomingAnonChatForOwner(chat, firebaseUid)) {
    if (threadAnon.startsWith("anon_")) candidates.add(threadAnon);
    if (liveAnon.startsWith("anon_")) candidates.add(liveAnon);
    for (const id of chat.participantes || []) {
      if (String(id).startsWith("anon_")) candidates.add(String(id));
    }
  }

  if (candidates.size === 0) {
    return chatUnreadCount(chat, primaryViewerId, { ...options, firebaseUid });
  }

  for (const viewerId of candidates) {
    if (chatUnreadCount(chat, viewerId, { ...options, firebaseUid }) > 0) {
      return 1;
    }
  }
  return 0;
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
