import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import {
  CHAT_ROOT_COLLECTIONS,
  MESSAGE_SUBCOLLECTIONS,
  isChatMember,
  type ChatMessageDeleteChat,
  type ChatMessageDeleteMessage,
} from "./deleteChatMessageCore";
import { resolveChatMessageLocation } from "./deleteChatMessage";
import {
  VIEW_ONCE_SECRETS_COLLECTION,
  decideViewOnceClaim,
  normalizeViewOnceLimit,
  viewOnceSecretDocId,
  type ViewOnceMessageFields,
} from "./viewOnceClaimCore";

function asId(value: unknown) {
  return String(value || "").trim();
}

export type ViewOnceClaimDeps = {
  db: Firestore;
};

export type ClaimViewOnceResult = {
  ok: boolean;
  mediaUrl?: string;
  remaining: number;
  openedCount: number;
  limit: number;
  exhausted: boolean;
  reason?: string;
};

/** Move mediaUrl off the public message doc into an Admin-only secret. */
export async function sealViewOnceMediaIfNeeded(
  db: Firestore,
  chatId: string,
  messageId: string,
  message: ViewOnceMessageFields & { mediaUrl?: string },
) {
  if (!message?.viewOnce) return;
  const url = asId(message.mediaUrl);
  if (!url) return;
  if (message.viewOnceSealed && !url) return;

  const secretId = viewOnceSecretDocId(chatId, messageId);
  const secretRef = db.collection(VIEW_ONCE_SECRETS_COLLECTION).doc(secretId);

  for (const chatRoot of CHAT_ROOT_COLLECTIONS) {
    for (const sub of MESSAGE_SUBCOLLECTIONS) {
      const messageRef = db.collection(chatRoot).doc(chatId).collection(sub).doc(messageId);
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(messageRef);
          if (!snap.exists) return;
          const data = (snap.data() || {}) as ViewOnceMessageFields;
          if (!data.viewOnce) return;
          const liveUrl = asId(data.mediaUrl);
          if (!liveUrl) return;

          tx.set(
            secretRef,
            {
              chatId,
              messageId,
              chatRoot,
              messageSubcollection: sub,
              mediaUrl: liveUrl,
              viewOnceLimit: normalizeViewOnceLimit(data.viewOnceLimit),
              sealedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          tx.update(messageRef, {
            mediaUrl: FieldValue.delete(),
            viewOnceSealed: true,
            viewOnceLimit: normalizeViewOnceLimit(data.viewOnceLimit),
            viewOnceOpenedCount: Math.max(0, Number(data.viewOnceOpenedCount) || 0),
          });
        });
      } catch {
        // Location may not exist for this root/sub pair.
      }
    }
  }
}

export async function handleClaimViewOnceMedia(
  request: Pick<CallableRequest, "auth" | "data">,
  deps: ViewOnceClaimDeps,
): Promise<ClaimViewOnceResult> {
  const uid = asId(request.auth?.uid);
  const chatId = asId(request.data?.chatId);
  const messageId = asId(request.data?.messageId);

  if (!uid) throw new HttpsError("unauthenticated", "Auth required");
  if (!chatId || !messageId) {
    throw new HttpsError("invalid-argument", "Invalid claim payload");
  }

  const secretRef = deps.db
    .collection(VIEW_ONCE_SECRETS_COLLECTION)
    .doc(viewOnceSecretDocId(chatId, messageId));

  return deps.db.runTransaction(async (tx) => {
    const located = await resolveChatMessageLocation(tx, deps.db, chatId, messageId);
    if ("error" in located) {
      throw new HttpsError("not-found", "Message not found");
    }

    const message = located.message as ChatMessageDeleteMessage & ViewOnceMessageFields;
    const chat = located.chat as ChatMessageDeleteChat;
    const member = isChatMember({ uid, chat, message });
    const secretSnap = await tx.get(secretRef);
    const secretMediaUrl = asId(secretSnap.data()?.mediaUrl);

    const decision = decideViewOnceClaim({
      uid,
      isMember: member,
      message,
      secretMediaUrl: secretMediaUrl || asId(message.mediaUrl),
    });

    if (!decision.ok) {
      if (decision.reason === "exhausted" || decision.reason === "missing-media") {
        const messageRef = located.chatRef
          .collection(located.messageSubcollection)
          .doc(messageId);
        tx.update(messageRef, {
          mediaUrl: FieldValue.delete(),
          viewOnceExhausted: true,
          viewOnceOpenedCount: decision.openedCount,
          viewOnceLimit: decision.limit,
        });
        if (secretSnap.exists) tx.delete(secretRef);
      }
      if (decision.reason === "author") {
        throw new HttpsError("permission-denied", "author_cannot_claim");
      }
      if (decision.reason === "not-member") {
        throw new HttpsError("permission-denied", "Not allowed");
      }
      return {
        ok: false,
        remaining: 0,
        openedCount: decision.openedCount,
        limit: decision.limit,
        exhausted: true,
        reason: decision.reason,
      };
    }

    const messageRef = located.chatRef.collection(located.messageSubcollection).doc(messageId);
    const patch: Record<string, unknown> = {
      viewOnceOpenedCount: decision.openedCount,
      viewOnceLimit: decision.limit,
      viewOnceSealed: true,
      mediaUrl: FieldValue.delete(),
    };
    if (decision.exhausted) {
      patch.viewOnceExhausted = true;
      if (secretSnap.exists) tx.delete(secretRef);
    } else if (!secretSnap.exists && decision.mediaUrl) {
      tx.set(
        secretRef,
        {
          chatId,
          messageId,
          mediaUrl: decision.mediaUrl,
          viewOnceLimit: decision.limit,
          sealedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    tx.update(messageRef, patch);

    return {
      ok: true,
      mediaUrl: String(decision.mediaUrl || ""),
      remaining: decision.remaining,
      openedCount: decision.openedCount,
      limit: decision.limit,
      exhausted: decision.exhausted,
    };
  });
}
