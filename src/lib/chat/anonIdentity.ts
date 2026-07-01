import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { ANON_SESSION_CHANGED_EVENT, getAnonSessionId } from "@/lib/chat/anonSession";
import { formatAnonSessionLabel } from "@/lib/chat/inboxPeerTitle";
import { isProfileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export function resolveProfileChatAnonIdentity(
  chatId: string,
  chatAnonSessionId = "",
) {
  const threadAnonId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
  const liveAnonId = getAnonSessionId();

  const identityChanged =
    threadAnonId.startsWith("anon_") &&
    liveAnonId.startsWith("anon_") &&
    threadAnonId !== liveAnonId;

  return {
    threadAnonId,
    liveAnonId,
    identityChanged,
    threadLabel: formatAnonSessionLabel(threadAnonId),
    liveLabel: formatAnonSessionLabel(liveAnonId),
  };
}

export function messageAnonSenderId(from: string) {
  const sender = String(from || "").trim();
  if (sender.startsWith("anon_")) return sender;
  return "";
}

export function shouldShowAnonIdentityDivider(
  currentFrom: string,
  previousFrom: string,
) {
  const currentAnon = messageAnonSenderId(currentFrom);
  const previousAnon = messageAnonSenderId(previousFrom);
  if (!currentAnon || !previousAnon) return false;
  if (isProfileReplyAuthorId(currentFrom) || isProfileReplyAuthorId(previousFrom)) {
    return false;
  }
  return currentAnon !== previousAnon;
}

export function subscribeAnonSession(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onStoreChange();
  window.addEventListener(ANON_SESSION_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ANON_SESSION_CHANGED_EVENT, handler);
}

export function getAnonSessionVersion() {
  return getAnonSessionId();
}
