import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { ANON_SESSION_CHANGED_EVENT, getAnonSessionId } from "@/lib/chat/anonSession";
import { formatAnonSessionLabel } from "@/lib/chat/inboxPeerTitle";
import { isProfileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export function resolveProfileChatAnonIdentity(
  chatId: string,
  chatAnonSessionId = "",
  options: { isOwnerViewing?: boolean } = {},
) {
  const threadAnonId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
  const liveAnonId = getAnonSessionId();

  // Profile owners also carry a browser anon id; only the visitor should see
  // identity-change guidance when their live session diverges from this thread.
  const identityChanged =
    !options.isOwnerViewing &&
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

/** Identity guide is only for anonymous visitors continuing the same thread. */
export function shouldShowAnonIdentityGuide(input: {
  isOwnerViewing: boolean;
  identityChanged: boolean;
  hasChatActivity: boolean;
  showModernVisitorIntro: boolean;
}) {
  if (input.isOwnerViewing) return false;
  if (!input.identityChanged) return false;
  return input.hasChatActivity || !input.showModernVisitorIntro;
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

/** Index in the timeline where the live anon identity starts (after older messages). */
export function findAnonIdentityChangeInsertIndex(
  messages: ReadonlyArray<{ fromUid?: string; mine?: boolean }>,
  threadAnonId: string,
  liveAnonId: string,
) {
  if (!threadAnonId.startsWith("anon_") || !liveAnonId.startsWith("anon_")) {
    return messages.length;
  }
  if (threadAnonId === liveAnonId) return -1;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const from = messageAnonSenderId(String(message.fromUid || ""));
    if (from === liveAnonId) return i;
    if (message.mine && from && from !== threadAnonId) return i;
  }

  return messages.length;
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
