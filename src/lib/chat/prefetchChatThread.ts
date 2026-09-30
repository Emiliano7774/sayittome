import {
  collection,
  getDocs,
  getDocsFromCache,
  limitToLast,
  orderBy,
  query,
} from "firebase/firestore";

import {
  readCachedChatMessages,
  writeCachedChatMessages,
  removeCachedChatMessages,
  type CachedChatMessage,
} from "@/lib/chat/chatMessageCache";
import { isDeletedInboxChatId, isMessageClearedByInboxDelete } from "@/lib/chat/deletedInboxChats";
import {
  firestoreMessageAuthorId,
  resolveFirestoreMessageType,
  resolveProfileAnonSenderKind,
} from "@/lib/chat/profileAnonMessageAuthor";
import { db } from "@/lib/firebase";

const inflight = new Map<string, Promise<CachedChatMessage[]>>();

function mapDocToCached(
  docSnap: { id: string; data: () => Record<string, unknown> },
): CachedChatMessage | null {
  const data = docSnap.data();
  const text = String(data.texto || data.text || "").trim();
  const mediaUrl = String(data.mediaUrl || "");
  if (!text && !mediaUrl) return null;

  const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
  const createdAtMs = createdAt?.toDate?.()?.getTime();
  const from = firestoreMessageAuthorId(data as Parameters<typeof firestoreMessageAuthorId>[0]);
  const senderKind = resolveProfileAnonSenderKind({
    senderKind: data.senderKind as string | undefined,
    from,
    threadAnonId: "",
    profileUid: "",
    messageProfileUid: String(data.profileUid || "").trim() || undefined,
  });

  return {
    id: docSnap.id,
    text: String(data.texto || data.text || ""),
    fromUid: from || undefined,
    senderAuthUid: String(data.senderAuthUid || "").trim() || undefined,
    senderProfileId: String(data.senderProfileId || "").trim() || undefined,
    senderRole: String(data.senderRole || "").trim() || undefined,
    senderKind: senderKind === "unknown" ? undefined : senderKind,
    reply: data.reply ? String(data.reply) : undefined,
    type: resolveFirestoreMessageType(data as Parameters<typeof resolveFirestoreMessageType>[0]),
    mediaUrl: mediaUrl || undefined,
    source: data.source as CachedChatMessage["source"],
    viewOnce: data.viewOnce === true,
    autoModerationRequiresBlur: data.autoModerationRequiresBlur === true,
    moderationRequiresBlur: data.moderationRequiresBlur === true,
    readBy: (data.readBy as Record<string, boolean>) || {},
    ...(createdAtMs ? { createdAtMs } : {}),
  };
}

/** Warm the thread cache before navigation so the chat opens with history visible. */
export function prefetchChatThread(chatId: string, options?: { force?: boolean }) {
  void prefetchChatThreadAsync(chatId, options);
}

/** Awaitable prefetch — returns cached rows (existing or freshly fetched). */
export function prefetchChatThreadAsync(
  chatId: string,
  options?: { force?: boolean },
): Promise<CachedChatMessage[]> {
  if (!chatId || typeof window === "undefined") return Promise.resolve([]);

  const existing = readCachedChatMessages(chatId);
  if (existing?.length && !options?.force) {
    const kept = existing.filter(
      (row) => !isMessageClearedByInboxDelete(chatId, row.createdAtMs),
    );
    if (kept.length !== existing.length) {
      if (kept.length) writeCachedChatMessages(chatId, kept);
      else removeCachedChatMessages(chatId);
    }
    if (kept.length) return Promise.resolve(kept);
  }

  const pending = inflight.get(chatId);
  if (pending) return pending;

  const run = (async () => {
    try {
      const q = query(
        collection(db, "chats", chatId, "mensajes"),
        orderBy("createdAt", "asc"),
        limitToLast(50),
      );
      try {
        const cachedSnap = await getDocsFromCache(q);
        const cachedMessages = cachedSnap.docs
          .map((docSnap) => mapDocToCached(docSnap))
          .filter((row): row is CachedChatMessage => row !== null)
          .filter((row) => !isMessageClearedByInboxDelete(chatId, row.createdAtMs));
        if (cachedMessages.length > 0) {
          writeCachedChatMessages(chatId, cachedMessages);
          return cachedMessages;
        }
      } catch {
        // Persistent Firestore cache may be unavailable on first boot/private mode.
      }

      const snap = await getDocs(q);
      const messages = snap.docs
        .map((docSnap) => mapDocToCached(docSnap))
        .filter((row): row is CachedChatMessage => row !== null)
        .filter((row) => !isMessageClearedByInboxDelete(chatId, row.createdAtMs));
      if (messages.length > 0) {
        writeCachedChatMessages(chatId, messages);
        return messages;
      }
      removeCachedChatMessages(chatId);
      return [];
    } catch {
      if (isDeletedInboxChatId(chatId)) return [];
      const cached = (readCachedChatMessages(chatId) || []).filter(
        (row) => !isMessageClearedByInboxDelete(chatId, row.createdAtMs),
      );
      return cached;
    } finally {
      inflight.delete(chatId);
    }
  })();

  inflight.set(chatId, run);
  return run;
}
