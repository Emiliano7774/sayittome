import { doc, increment, updateDoc } from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { markChatReadLocally } from "@/lib/chat/localChatRead";
import { db } from "@/lib/firebase";

export function inboxChatFromFirestore(
  chatId: string,
  data: Record<string, unknown> | undefined,
  fallbackUsername = "",
): InboxChat {
  const row = data || {};

  return {
    id: chatId,
    canonicalChatId: chatId,
    targetUsername: String(row.targetUsername || fallbackUsername),
    receptorUsername: String(row.receptorUsername || fallbackUsername),
    targetUid: row.targetUid as string | undefined,
    receptorUid: row.receptorUid as string | undefined,
    anonSessionId: row.anonSessionId as string | undefined,
    lastMessage: row.lastMessage as string | undefined,
    lastMessageSender: row.lastMessageSender as string | undefined,
    updatedAt: row.updatedAt as InboxChat["updatedAt"],
    readBy: row.readBy as Record<string, boolean> | undefined,
    unreadCounts: row.unreadCounts as Record<string, number> | undefined,
  };
}

export async function increaseUnread(chatId: string, targetUid: string) {
  await updateDoc(doc(db, "chats", chatId), {
    [`unreadCounts.${targetUid}`]: increment(1),
  });
}

export async function clearUnread(chatId: string, uid: string) {
  await updateDoc(doc(db, "chats", chatId), {
    [`unreadCounts.${uid}`]: 0,
  });
}

export async function markChatAsRead(
  chatId: string,
  viewerId: string,
  chat?: InboxChat,
  firebaseUid = "",
) {
  if (!chatId || !viewerId) return;

  if (chat) {
    markChatReadLocally(chat, viewerId);
    if (firebaseUid && firebaseUid !== viewerId) {
      markChatReadLocally(chat, firebaseUid);
    }
  }

  const patch: Record<string, boolean | number> = {
    [`readBy.${viewerId}`]: true,
    [`unreadCounts.${viewerId}`]: 0,
  };

  if (firebaseUid && firebaseUid !== viewerId) {
    patch[`readBy.${firebaseUid}`] = true;
    patch[`unreadCounts.${firebaseUid}`] = 0;
  }

  try {
    await updateDoc(doc(db, "chats", chatId), patch);
  } catch (error) {
    console.error("markChatAsRead", chatId, error);
  }
}
