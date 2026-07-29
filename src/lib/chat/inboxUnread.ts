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
  // Firebase anonymous auth uids must not steal visitor unread evaluation.
  // Prefer the live visitor anon when it is in the thread — poisoned
  // anonSessionId (owner browser session) must not win over the real visitor.
  if (liveAnon.startsWith("anon_") && !isIncomingAnonChatForOwner(chat, firebaseUid)) {
    const threadAnon = profileAnonSenderFromChat(chat);
    const members = chat.participantes || [];
    if (members.includes(liveAnon) || viewerId === liveAnon || threadAnon === liveAnon) {
      if (threadAnon.startsWith("anon_") && threadAnon !== liveAnon && members.includes(liveAnon)) {
        viewerId = liveAnon;
      } else {
        viewerId = threadAnon.startsWith("anon_") ? threadAnon : liveAnon;
      }
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
