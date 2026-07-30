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
import { computeThreadPendingForViewer } from "@/lib/chat/threadPending";
import { markChatReadLocally } from "@/lib/chat/localChatRead";
import { db } from "@/lib/firebase";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";

export type MarkChatAsReadOptions = {
  latestReadMessageId?: string;
  reason?: string;
};

export function inboxChatFromFirestore(
  chatId: string,
  data: Record<string, unknown> | undefined,
  fallbackUsername = "",
): InboxChat {
  const row = data || {};

  return {
    id: chatId,
    canonicalChatId: String(row.canonicalChatId || chatId),
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
    latestReadMessageId: row.latestReadMessageId as string | undefined,
    latestReadMessageIds: row.latestReadMessageIds as
      | Record<string, string>
      | undefined,
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
  options: MarkChatAsReadOptions = {},
) {
  if (!chatId || !viewerId) return;

  const latestReadMessageId = String(
    options.latestReadMessageId || chat?.latestMessageId || "",
  ).trim();

  const chatForLocal: InboxChat | undefined = chat
    ? {
        ...chat,
        latestMessageId: latestReadMessageId || chat.latestMessageId,
        latestReadMessageId: latestReadMessageId || chat.latestReadMessageId,
        latestReadMessageIds: {
          ...(chat.latestReadMessageIds || {}),
          ...(latestReadMessageId ? { [viewerId]: latestReadMessageId } : {}),
        },
        unreadCounts: {
          ...(chat.unreadCounts || {}),
          [viewerId]: 0,
        },
        readBy: {
          ...(chat.readBy || {}),
          [viewerId]: true,
        },
      }
    : undefined;

  if (chatForLocal) {
    markChatReadLocally(chatForLocal, viewerId, firebaseUid);
  }

  const readTimestamp = serverTimestamp();
  const patch: Record<string, boolean | number | string | FieldValue> = {
    [`readBy.${viewerId}`]: true,
    [`readAt.${viewerId}`]: readTimestamp,
    [`unreadCounts.${viewerId}`]: 0,
  };

  if (latestReadMessageId) {
    patch.latestReadMessageId = latestReadMessageId;
    patch[`latestReadMessageIds.${viewerId}`] = latestReadMessageId;
  }

  if (chat) {
    for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid)) {
      patch[`readBy.${id}`] = true;
      patch[`readAt.${id}`] = readTimestamp;
      patch[`unreadCounts.${id}`] = 0;
      if (latestReadMessageId) {
        patch[`latestReadMessageIds.${id}`] = latestReadMessageId;
      }
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
    if (latestReadMessageId) {
      patch[`latestReadMessageIds.${firebaseUid}`] = latestReadMessageId;
    }
  }

  try {
    recordQaCriticalEvent("chat", "CHAT_READ_MARK", {
      reason: options.reason || "exact-detail",
      threadId: chatId,
      viewerId,
      latestReadMessageId: latestReadMessageId || null,
    });
    await updateDoc(doc(db, "chats", chatId), patch);
  } catch (error) {
    console.error("markChatAsRead", chatId, error);
    throw error;
  }
}

export async function markThreadReadExact(
  canonicalThreadId: string,
  latestRenderedInboundMessageId: string,
  reason: string,
  viewerId: string,
  chat?: InboxChat,
  firebaseUid = "",
) {
  return markChatAsRead(canonicalThreadId, viewerId, chat, firebaseUid, {
    latestReadMessageId: latestRenderedInboundMessageId,
    reason,
  });
}

export type MarkAllSeenResult = {
  attempted: number;
  cleared: number;
  failed: number;
};

/**
 * Bounded mark-all for the current viewer. Optimistic local clears happen
 * inside markChatAsRead before each write. Does not delete messages.
 */
export async function markAllPendingChatsAsRead(
  chats: InboxChat[],
  firebaseUid = "",
  chunkSize = 25,
): Promise<MarkAllSeenResult> {
  const pending = chats.filter(
    (chat) =>
      computeThreadPendingForViewer(chat, firebaseUid, "").computedPending,
  );

  let cleared = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += Math.max(1, chunkSize)) {
    const chunk = pending.slice(i, i + Math.max(1, chunkSize));
    await Promise.all(
      chunk.map(async (chat) => {
        const threadId = chat.canonicalChatId || chat.id;
        const viewerId =
          computeThreadPendingForViewer(chat, firebaseUid, "").viewerId;
        if (!threadId || !viewerId) {
          failed += 1;
          return;
        }
        try {
          await markChatAsRead(threadId, viewerId, chat, firebaseUid, {
            latestReadMessageId: chat.latestMessageId,
            reason: "mark-all-seen",
          });
          cleared += 1;
        } catch {
          failed += 1;
        }
      }),
    );
  }

  return { attempted: pending.length, cleared, failed };
}
