import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { readCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";

export type PreparedProfileChat = {
  username: string;
  chatId: string;
  href: string;
  senderId: string;
  messagesCached: boolean;
  preparedAt: number;
};

let prepared: PreparedProfileChat | null = null;
let chunkWarmStarted = false;

function normalizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

/** PREPARE — no navigation, no Firestore writes, at most one thread prefetch. */
export function prepareProfileChat(username: string, { promote = false } = {}) {
  const slug = normalizeUsername(username);
  if (!slug) return null;

  const senderId = getChatAnonSenderId();
  const chatId = buildProfileAnonChatId(senderId, slug);
  const href = `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(slug)}`;

  const existing = readCachedChatMessages(chatId);
  const next: PreparedProfileChat = {
    username: slug,
    chatId,
    href,
    senderId,
    messagesCached: Boolean(existing?.length),
    preparedAt: Date.now(),
  };

  if (
    prepared?.username === slug &&
    prepared.chatId === chatId &&
    !promote &&
    prepared.messagesCached
  ) {
    return prepared;
  }

  prepared = next;

  if (promote || !next.messagesCached) {
    prefetchChatThread(chatId);
  }

  if (!chunkWarmStarted && typeof window !== "undefined") {
    chunkWarmStarted = true;
    void import("@/components/chat/ProfileAnonChat");
  }

  return prepared;
}

export function peekPreparedProfileChat(username?: string) {
  if (!prepared) return null;
  if (username && normalizeUsername(username) !== prepared.username) return null;
  return prepared;
}

export function consumePreparedProfileChat(username: string) {
  const slug = normalizeUsername(username);
  if (!prepared || prepared.username !== slug) {
    return prepareProfileChat(slug, { promote: true });
  }
  const row = prepared;
  prefetchChatThread(row.chatId);
  return row;
}

export function clearPreparedProfileChat(username?: string) {
  if (!prepared) return;
  if (username && normalizeUsername(username) !== prepared.username) return;
  prepared = null;
}
