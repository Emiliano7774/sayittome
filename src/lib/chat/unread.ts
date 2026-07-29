import {
  doc,
  increment,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { collectViewerSenderIds } from "@/lib/chat/incomingChatActivity";
import { isAnonVisitorProfileChat } from "@/lib/chat/inboxPeerTitle";
import { markChatReadLocally } from "@/lib/chat/localChatRead";
import { db } from "@/lib/firebase";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

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
    latestMessageId: row.latestMessageId as string | undefined,
    latestSenderKind: row.latestSenderKind as string | undefined,
    latestSenderAnonSessionId:
      row.latestSenderAnonSessionId as string | undefined,
    lastMessageAt: row.lastMessageAt as InboxChat["lastMessageAt"],
    updatedAt: row.updatedAt as InboxChat["updatedAt"],
    readBy: row.readBy as Record<string, boolean> | undefined,
    readAt: row.readAt as Record<string, unknown> | undefined,
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
    markChatReadLocally(chat, viewerId, firebaseUid);
  }

  const readTimestamp = serverTimestamp();
  const patch: Record<string, boolean | number | FieldValue> = {
    [`readBy.${viewerId}`]: true,
    [`readAt.${viewerId}`]: readTimestamp,
    [`unreadCounts.${viewerId}`]: 0,
  };

  if (chat) {
    for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid)) {
      patch[`readBy.${id}`] = true;
      patch[`readAt.${id}`] = readTimestamp;
      patch[`unreadCounts.${id}`] = 0;
    }
  }

  const viewerIsAnonSession = viewerId.startsWith("anon_");
  if (
    firebaseUid &&
    firebaseUid !== viewerId &&
    !viewerIsAnonSession &&
    !(chat && isAnonVisitorProfileChat(chat, firebaseUid))
  ) {
    patch[`readBy.${firebaseUid}`] = true;
    patch[`readAt.${firebaseUid}`] = readTimestamp;
    patch[`unreadCounts.${firebaseUid}`] = 0;
  }

  try {
    recordQaCriticalEvent("chat", "CHAT_READ_MARK", {
      reason: "exact-detail",
      threadId: chatId,
      viewerId,
    });
    await updateDoc(doc(db, "chats", chatId), patch);
  } catch (error) {
    console.error("markChatAsRead", chatId, error);
  }
}
