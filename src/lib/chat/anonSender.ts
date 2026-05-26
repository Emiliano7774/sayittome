import { getAnonSessionId } from "@/lib/chat/anonSession";

/**
 * Sender identity in profile anon chats is ALWAYS the browser anon session,
 * never Firebase uid — even when the visitor is logged in.
 */
export function getChatAnonSenderId() {
  return getAnonSessionId();
}
