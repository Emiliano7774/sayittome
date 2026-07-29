import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getAnonSessionId } from "@/lib/chat/anonSession";

/**
 * Sender identity in profile anon chats is ALWAYS the browser anon session,
 * never Firebase uid — even when the visitor is logged in.
 */
export function getChatAnonSenderId() {
  return getAnonSessionId();
}

/**
 * Anon sender for an open profile chat. Reuses the session baked into the chat
 * id (or stored on the chat doc) so a page refresh does not split the thread.
 */
export function getProfileChatAnonSenderId(
  chatId: string,
  chatAnonSessionId?: string,
) {
  const fromDoc = String(chatAnonSessionId || "").trim();
  const fromChatId =
    isProfileAnonChatId(chatId) &&
    parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(chatId).senderId
      : "";

  // chatId-embedded visitor wins over a poisoned doc anonSessionId.
  if (fromChatId && fromDoc.startsWith("anon_") && fromDoc !== fromChatId) {
    return fromChatId;
  }
  if (fromChatId) return fromChatId;
  if (fromDoc.startsWith("anon_")) return fromDoc;

  return getAnonSessionId();
}
