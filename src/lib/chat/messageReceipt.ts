import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import type { InboxChat } from "@/hooks/useChatsInbox";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export type MessageReceiptStatus = "sending" | "delivered" | "seen" | "error";

type ChatReadContext = Pick<
  InboxChat,
  "targetUid" | "receptorUid" | "anonSessionId" | "participantes" | "id" | "canonicalChatId"
>;

/** All readBy keys that represent the outgoing sender (not the recipient). */
export function collectSenderReadByKeys(senderId: string, firebaseUid = "") {
  const keys = new Set<string>();
  const from = String(senderId || "").trim();

  if (from) keys.add(from);

  if (firebaseUid) {
    keys.add(firebaseUid);
    keys.add(profileReplyAuthorId(firebaseUid));
  }

  if (from.startsWith("profile_")) {
    const profileUid = from.slice("profile_".length);
    if (profileUid && profileUid !== "unknown") keys.add(profileUid);
  }

  return keys;
}

/** Firebase uid and profile reply alias share the same read state. */
export function expandReadByIdentityKeys(uid: string) {
  const id = String(uid || "").trim();
  if (!id) return [] as string[];

  const keys = [id];
  if (!id.startsWith("anon_") && !id.startsWith("profile_")) {
    keys.push(profileReplyAuthorId(id));
  }

  return keys;
}

export function collectRecipientReadByKeys(
  senderId: string,
  firebaseUid: string,
  chat?: ChatReadContext,
) {
  const senderKeys = collectSenderReadByKeys(senderId, firebaseUid);
  const peers = new Set<string>();

  const addFirebasePeer = (value: string) => {
    for (const key of expandReadByIdentityKeys(value)) {
      if (!senderKeys.has(key)) peers.add(key);
    }
  };

  const addAnonPeer = (value: string) => {
    const id = String(value || "").trim();
    if (id.startsWith("anon_") && !senderKeys.has(id)) peers.add(id);
  };

  if (!chat) return peers;

  const from = String(senderId || "").trim();
  const senderIsProfileAuthor =
    from.startsWith("profile_") ||
    Boolean(
      firebaseUid &&
        (from === firebaseUid || from === profileReplyAuthorId(firebaseUid)),
    );

  if (senderIsProfileAuthor) {
    addAnonPeer(String(chat.anonSessionId || ""));

    const chatId = chat.canonicalChatId || chat.id;
    if (isProfileAnonChatId(chatId)) {
      addAnonPeer(parseProfileAnonChatId(chatId).senderId);
    }

    if (Array.isArray(chat.participantes)) {
      for (const participant of chat.participantes) {
        addAnonPeer(participant);
      }
    }

    return peers;
  }

  const ownerUid = String(chat.targetUid || chat.receptorUid || "").trim();
  if (ownerUid) addFirebasePeer(ownerUid);

  const receptorUid = String(chat.receptorUid || "").trim();
  if (receptorUid && receptorUid !== ownerUid) addFirebasePeer(receptorUid);

  if (Array.isArray(chat.participantes)) {
    for (const participant of chat.participantes) {
      if (participant.startsWith("anon_")) continue;
      addFirebasePeer(participant);
    }
  }

  return peers;
}

function splitPeerKeys(peerKeys: Set<string>) {
  const canonical: string[] = [];
  const aliases: string[] = [];

  for (const key of peerKeys) {
    if (key.startsWith("profile_") || key.startsWith("anon_")) {
      aliases.push(key);
    } else {
      canonical.push(key);
    }
  }

  return { canonical, aliases };
}

export function isRecipientReadInMap(
  readBy: Record<string, boolean> | undefined,
  peerKeys: Set<string>,
) {
  if (!readBy || peerKeys.size === 0) return false;

  const { canonical, aliases } = splitPeerKeys(peerKeys);
  const presentCanonical = canonical.filter((key) => key in readBy);

  if (presentCanonical.length > 0) {
    if (presentCanonical.some((key) => readBy[key] === false)) return false;
    return presentCanonical.some((key) => readBy[key] === true);
  }

  const presentAliases = aliases.filter((key) => key in readBy);
  if (presentAliases.length > 0) {
    if (presentAliases.some((key) => readBy[key] === false)) return false;
    return presentAliases.some((key) => readBy[key] === true);
  }

  return false;
}

export function isMessageSeenByOther(
  readBy: Record<string, boolean> | undefined,
  senderId: string,
  firebaseUid = "",
  chat?: ChatReadContext,
) {
  if (chat) {
    const peerKeys = collectRecipientReadByKeys(senderId, firebaseUid, chat);
    if (peerKeys.size > 0) {
      return isRecipientReadInMap(readBy, peerKeys);
    }
  }

  const senderKeys = collectSenderReadByKeys(senderId, firebaseUid);

  return Object.entries(readBy || {}).some(
    ([key, value]) => !senderKeys.has(key) && value === true,
  );
}

export function resolveMessageReceiptStatus({
  mine,
  readBy,
  senderId,
  firebaseUid = "",
  isSending = false,
  hasError = false,
}: {
  mine: boolean;
  readBy?: Record<string, boolean>;
  senderId: string;
  firebaseUid?: string;
  isSending?: boolean;
  hasError?: boolean;
}): MessageReceiptStatus | null {
  if (!mine) return null;
  if (hasError) return "error";
  if (isSending) return "sending";
  if (isMessageSeenByOther(readBy, senderId, firebaseUid)) return "seen";
  return "delivered";
}
