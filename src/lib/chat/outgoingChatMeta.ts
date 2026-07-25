import { increment, serverTimestamp, type FieldValue } from "firebase/firestore";

import type { InboxChat } from "@/hooks/useChatsInbox";
import { expandReadByIdentityKeys } from "@/lib/chat/messageReceipt";

type ChatMetaSource = Partial<Pick<InboxChat, "participantes" | "targetUid" | "receptorUid">> & {
  participants?: string[];
};

export function resolveChatRecipientIds(
  senderUid: string,
  chat: ChatMetaSource | null | undefined,
): string[] {
  if (!chat || !senderUid) return [];

  const ids = new Set<string>();
  const members = chat.participantes || chat.participants || [];

  for (const uid of members) {
    if (uid && uid !== senderUid) ids.add(uid);
  }

  if (chat.targetUid && chat.targetUid !== senderUid) ids.add(chat.targetUid);
  if (chat.receptorUid && chat.receptorUid !== senderUid) ids.add(chat.receptorUid);

  return [...ids];
}

export function buildOutgoingChatMetaPatch(
  senderUid: string,
  recipients: string[],
  meta: { lastMessage: string; lastMessageSender: string },
): Record<string, string | boolean | FieldValue> {
  const patch: Record<string, string | boolean | FieldValue> = {
    lastMessage: meta.lastMessage,
    lastMessageSender: meta.lastMessageSender,
    updatedAt: serverTimestamp(),
    [`readBy.${senderUid}`]: true,
    [`typing.${senderUid}`]: false,
  };

  for (const recipientUid of recipients) {
    for (const readByKey of expandReadByIdentityKeys(recipientUid)) {
      patch[`readBy.${readByKey}`] = false;
      // Mirror unread onto every identity alias so wasChatReadOnServer cannot
      // stay "explicitlyRead" on profile_* / firebase uid after markChatAsRead
      // when only one key was incremented (repeat-inbound highlight miss).
      patch[`unreadCounts.${readByKey}`] = increment(1);
    }
  }

  return patch;
}
