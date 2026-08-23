import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { storage } from "./adminApp";

import {
  CHAT_ROOT_COLLECTIONS,
  MESSAGE_SUBCOLLECTIONS,
  classifyStorageDeleteResult,
  decideChatMessageDelete,
  pickUniqueChatMessageLocation,
  tombstonePublicFields,
  type ChatMessageDeleteChat,
  type ChatMessageDeleteMessage,
  type ResolvedChatMessageLocation,
} from "./deleteChatMessageCore";

export { CHAT_ROOT_COLLECTIONS, MESSAGE_SUBCOLLECTIONS };

export type DeleteChatMessageDeps = {
  db: Firestore;
  deleteStoragePath?: (path: string) => Promise<void>;
};

type LocatedChatMessage = ResolvedChatMessageLocation & {
  chatRef: DocumentReference;
  chat: ChatMessageDeleteChat;
  message: ChatMessageDeleteMessage;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export async function resolveChatMessageLocation(
  tx: { get: (ref: DocumentReference) => Promise<{ exists: boolean; data: () => unknown }> },
  db: Firestore,
  chatId: string,
  messageId: string,
): Promise<LocatedChatMessage | { error: "not-found"; target: "chat" | "message" | "ambiguous" }> {
  const hits: LocatedChatMessage[] = [];
  let sawChat = false;

  for (const chatRoot of CHAT_ROOT_COLLECTIONS) {
    const chatRef = db.collection(chatRoot).doc(chatId);
    const chatSnap = await tx.get(chatRef);
    if (!chatSnap.exists) continue;
    sawChat = true;
    for (const messageSubcollection of MESSAGE_SUBCOLLECTIONS) {
      const messageSnap = await tx.get(chatRef.collection(messageSubcollection).doc(messageId));
      if (!messageSnap.exists) continue;
      hits.push({
        chatRoot,
        messageSubcollection,
        chatRef,
        chat: (chatSnap.data() || {}) as ChatMessageDeleteChat,
        message: (messageSnap.data() || {}) as ChatMessageDeleteMessage,
      });
    }
  }

  const unique = pickUniqueChatMessageLocation(hits);
  if (unique) {
    return hits[0];
  }
  if (hits.length > 1) {
    return { error: "not-found", target: "ambiguous" };
  }
  if (sawChat) {
    return { error: "not-found", target: "message" };
  }
  return { error: "not-found", target: "chat" };
}

export async function handleDeleteChatMessage(
  request: Pick<CallableRequest, "auth" | "data">,
  deps: DeleteChatMessageDeps,
) {
  const uid = asId(request.auth?.uid);
  const chatId = asId(request.data?.chatId);
  const messageId = asId(request.data?.messageId);
  const mode = String(request.data?.mode || "").trim();

  const preview = decideChatMessageDelete({
    uid,
    mode,
    chatId,
    messageId,
    chat: {},
    message: {},
  });
  if (!preview.ok && preview.error === "unauthenticated") {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  if (!preview.ok && preview.error === "invalid-argument") {
    throw new HttpsError("invalid-argument", "Invalid delete payload");
  }

  const db = deps.db;
  let storagePath = "";
  let resultMode: "me" | "everyone" = mode === "everyone" ? "everyone" : "me";
  let alreadyApplied = false;
  const locatedRef: { current: DocumentReference | null } = { current: null };

  await db.runTransaction(async (tx) => {
    const located = await resolveChatMessageLocation(tx, db, chatId, messageId);
    if ("error" in located) {
      throw new HttpsError("not-found", located.target === "message" ? "Message not found" : "Chat not found");
    }

    const decision = decideChatMessageDelete({
      uid,
      mode,
      chatId,
      messageId,
      chat: located.chat,
      message: located.message,
    });
    if (!decision.ok) {
      if (decision.error === "permission-denied") {
        throw new HttpsError("permission-denied", "Not allowed");
      }
      throw new HttpsError("invalid-argument", decision.error);
    }

    resultMode = decision.mode;
    alreadyApplied = decision.alreadyApplied;
    locatedRef.current = located.chatRef;
    const messageRef = located.chatRef.collection(located.messageSubcollection).doc(messageId);

    if (decision.mode === "me") {
      if (!decision.alreadyApplied) {
        tx.update(messageRef, {
          [`hiddenFor.${decision.hideKey}`]: true,
        });
      }
      return;
    }

    storagePath = decision.storagePath;
    if (!decision.alreadyApplied) {
      const tombstone = tombstonePublicFields();
      tx.update(messageRef, {
        ...tombstone,
        deletedBy: uid,
        deletedAt: FieldValue.serverTimestamp(),
        storyReply: FieldValue.delete(),
        previousMediaUrl: FieldValue.delete(),
      });
    }
    if (decision.summary) {
      const summaryPatch: Record<string, unknown> = {
        lastMessage: decision.summary.lastMessage,
        lastMessageSender: decision.summary.lastMessageSender,
        latestMessageId: decision.summary.latestMessageId,
        latestSenderKind: decision.summary.latestSenderKind || "",
      };
      if (
        located.chatRoot === "chats_anonimos" ||
        Object.prototype.hasOwnProperty.call(located.chat, "ultimoMensaje")
      ) {
        summaryPatch.ultimoMensaje = decision.summary.lastMessage;
      }
      tx.update(located.chatRef, summaryPatch);
    }
    if (storagePath) {
      tx.set(
        located.chatRef.collection("deletedAttachments").doc(messageId),
        { path: storagePath, deletedBy: uid, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  });

  if (resultMode === "everyone" && locatedRef.current) {
    const chatRef = locatedRef.current;
    const attachmentSnap = await chatRef.collection("deletedAttachments").doc(messageId).get();
    const pendingPath = asId(attachmentSnap.data()?.path) || storagePath;
    if (pendingPath && deps.deleteStoragePath) {
      try {
        await deps.deleteStoragePath(pendingPath);
        await attachmentSnap.ref.delete().catch(() => {});
      } catch (error) {
        const classified = classifyStorageDeleteResult(error);
        if (classified === "missing") {
          await attachmentSnap.ref.delete().catch(() => {});
        } else {
          return {
            ok: true as const,
            mode: resultMode,
            alreadyApplied,
            cleanupPending: true as const,
          };
        }
      }
    }
  }

  return { ok: true as const, mode: resultMode, alreadyApplied, cleanupPending: false as const };
}

export async function deleteStorageObject(path: string) {
  const bucket = storage().bucket();
  await bucket.file(path).delete({ ignoreNotFound: true });
}
