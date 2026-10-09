import { doc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

/**
 * Read marker on chats_anonimos keyed by Firebase Auth UID.
 * Does not touch `chats/` or profile-anon continuity keys.
 */
export async function markAnonDirectChatRead(input: {
  chatId: string;
  viewerAuthUid: string;
  latestMessageId?: string;
}) {
  const chatId = String(input.chatId || "").trim();
  const viewerAuthUid = String(input.viewerAuthUid || "").trim();
  if (!chatId || !viewerAuthUid) return;

  const latestMessageId = String(input.latestMessageId || "").trim();
  const patch: Record<string, unknown> = {
    [`readBy.${viewerAuthUid}`]: true,
    [`unreadCounts.${viewerAuthUid}`]: 0,
  };
  if (latestMessageId) {
    patch[`latestReadMessageIds.${viewerAuthUid}`] = latestMessageId;
  }

  await updateDoc(doc(db, "chats_anonimos", chatId), patch);
}
