import type { InboxChat } from "@/hooks/useChatsInbox";

export function hasInboxPreview(chat: Pick<InboxChat, "lastMessage">) {
  return Boolean(String(chat.lastMessage || "").trim());
}

export function isVisibleInboxChat(chat: InboxChat) {
  return hasInboxPreview(chat);
}
