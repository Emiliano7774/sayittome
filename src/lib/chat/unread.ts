import { doc, increment, updateDoc } from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { markChatReadLocally } from "@/lib/chat/localChatRead";
import { db } from "@/lib/firebase";

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

export async function markChatAsRead(chatId: string, viewerId: string, chat?: InboxChat) {
  if (!chatId || !viewerId) return;

  if (chat) {
    markChatReadLocally(chat, viewerId);
  }

  try {
    await updateDoc(doc(db, "chats", chatId), {
      [`readBy.${viewerId}`]: true,
      [`unreadCounts.${viewerId}`]: 0,
    });
  } catch (error) {
    console.error("markChatAsRead", chatId, error);
  }
}
