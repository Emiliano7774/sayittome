import {
  collection,
  getDocs,
  limitToLast,
  orderBy,
  query,
} from "firebase/firestore";

import {
  readCachedChatMessages,
  writeCachedChatMessages,
  type CachedChatMessage,
} from "@/lib/chat/chatMessageCache";
import {
  firestoreMessageAuthorId,
  resolveFirestoreMessageType,
  resolveProfileAnonSenderKind,
} from "@/lib/chat/profileAnonMessageAuthor";
import { db } from "@/lib/firebase";

const inflight = new Map<string, Promise<void>>();

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
export function prefetchChatThread(chatId: string) {
  if (!chatId || typeof window === "undefined") return;
  if (readCachedChatMessages(chatId)?.length) return;

  const pending = inflight.get(chatId);
  if (pending) return;

  const run = (async () => {
    try {
      const q = query(
        collection(db, "chats", chatId, "mensajes"),
        orderBy("createdAt", "asc"),
        limitToLast(50),
      );
      const snap = await getDocs(q);
      const messages = snap.docs
        .map((docSnap) => mapDocToCached(docSnap))
        .filter((row): row is CachedChatMessage => row !== null);
      if (messages.length > 0) {
        writeCachedChatMessages(chatId, messages);
      }
    } catch {
      // best-effort prefetch
    } finally {
      inflight.delete(chatId);
    }
  })();

  inflight.set(chatId, run);
}
