import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { db, ensureAdminApp } from "./adminApp";

const ANON_TO_MARKER = "__anon_to__";

export type AnonProfileBlockInput = {
  chatId?: string;
  blocked?: boolean;
  anonSessionId?: string;
};

export function parseAnonSessionFromChatId(chatId: string): string {
  const id = String(chatId || "").trim();
  if (!id.includes(ANON_TO_MARKER)) return "";
  const senderId = id.split(ANON_TO_MARKER)[0] || "";
  return senderId.startsWith("anon_") ? senderId : "";
}

export function anonProfileBlockIds(anonSessionId: string, profileUid: string, chatId: string) {
  const anon = String(anonSessionId || "").trim();
  const uid = String(profileUid || "").trim();
  const chat = String(chatId || "").trim();
  return {
    /** Canonical authority key for rules: one block doc per thread. */
    chatScopedId: chat,
    /** Legacy / FCM lookup key. */
    pairId: anon && uid ? `${anon}__${uid}` : "",
  };
}

export function assertAnonVisitorMayManageBlock(input: {
  authUid: string;
  anonSessionId: string;
  profileUid: string;
  chat: Record<string, unknown>;
}): void {
  const authUid = String(input.authUid || "").trim();
  const anonSessionId = String(input.anonSessionId || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  if (!anonSessionId.startsWith("anon_") || !profileUid) {
    throw new HttpsError("invalid-argument", "Invalid block identity");
  }
  if (authUid === profileUid) {
    throw new HttpsError("permission-denied", "Profile cannot self-manage anon block");
  }

  const chatId = String(input.chat.id || "").trim();
  const participantes = [
    ...(Array.isArray(input.chat.participantes) ? input.chat.participantes : []),
    ...(Array.isArray(input.chat.participants) ? input.chat.participants : []),
  ].map((entry) => String(entry || "").trim());

  const chatAnon = String(input.chat.anonSessionId || "").trim();
  const chatIdBound = chatId.startsWith(`${anonSessionId}${ANON_TO_MARKER}`);
  const hasAnon =
    chatIdBound ||
    participantes.includes(anonSessionId) ||
    chatAnon === anonSessionId;

  const initiator = String(input.chat.initiatorUid || "").trim();
  const visitorAuth = String(input.chat.visitorAuthUid || "").trim();
  const hasAuth =
    participantes.includes(authUid) ||
    initiator === authUid ||
    visitorAuth === authUid;

  if (!hasAnon) {
    throw new HttpsError("permission-denied", "Anon identity not linked to chat");
  }
  if (hasAuth) return;

  // First bind only: no other visitor auth claimed this thread yet.
  if (visitorAuth && visitorAuth !== authUid) {
    throw new HttpsError("permission-denied", "Chat already bound to another visitor");
  }
  if (initiator && initiator !== authUid) {
    throw new HttpsError("permission-denied", "Chat initiator mismatch");
  }
  if (!chatIdBound) {
    throw new HttpsError("permission-denied", "Anon auth not linked to chat");
  }
}

export async function handleSetAnonProfileBlock(
  request: Pick<CallableRequest, "auth" | "data">,
) {
  ensureAdminApp();
  const authUid = String(request.auth?.uid || "").trim();
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const data = (request.data || {}) as AnonProfileBlockInput;
  const chatId = String(data.chatId || "").trim();
  const blocked = data.blocked === true;
  const claimedAnon = String(data.anonSessionId || "").trim();
  const anonFromChat = parseAnonSessionFromChatId(chatId);
  if (!chatId || !anonFromChat) {
    throw new HttpsError("invalid-argument", "Invalid chatId");
  }
  if (claimedAnon && claimedAnon !== anonFromChat) {
    throw new HttpsError("permission-denied", "anon_identity_mismatch");
  }

  const chatRef = db().collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new HttpsError("not-found", "Chat not found");
  }
  const chat = (chatSnap.data() || {}) as Record<string, unknown>;
  const profileUid = String(
    chat.receptorUid || chat.targetUid || chat.anonOwnerUid || "",
  ).trim();
  if (!profileUid) {
    throw new HttpsError("failed-precondition", "Chat missing profile uid");
  }

  assertAnonVisitorMayManageBlock({
    authUid,
    anonSessionId: anonFromChat,
    profileUid,
    chat: { ...chat, id: chatId },
  });

  const ids = anonProfileBlockIds(anonFromChat, profileUid, chatId);
  const batch = db().batch();

  if (blocked) {
    const payload = {
      anonSessionId: anonFromChat,
      blockedProfileUid: profileUid,
      chatId,
      blockedByAuthUid: authUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.set(db().collection("anon_profile_blocks").doc(ids.chatScopedId), payload, {
      merge: true,
    });
    if (ids.pairId && ids.pairId !== ids.chatScopedId) {
      batch.set(db().collection("anon_profile_blocks").doc(ids.pairId), payload, {
        merge: true,
      });
    }
    batch.set(
      chatRef,
      {
        anonBlocksProfile: true,
        anonBlocksProfileAt: FieldValue.serverTimestamp(),
        anonBlocksProfileBy: authUid,
        visitorAuthUid: String(chat.visitorAuthUid || authUid),
      },
      { merge: true },
    );
  } else {
    batch.delete(db().collection("anon_profile_blocks").doc(ids.chatScopedId));
    if (ids.pairId && ids.pairId !== ids.chatScopedId) {
      batch.delete(db().collection("anon_profile_blocks").doc(ids.pairId));
    }
    batch.set(
      chatRef,
      {
        anonBlocksProfile: false,
        anonBlocksProfileAt: FieldValue.serverTimestamp(),
        anonBlocksProfileBy: authUid,
      },
      { merge: true },
    );
  }

  await batch.commit();
  return {
    ok: true as const,
    blocked,
    chatId,
    anonSessionId: anonFromChat,
    blockedProfileUid: profileUid,
  };
}
