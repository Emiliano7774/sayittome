/**
 * Durable anon → profile block. Writes are Admin SDK only via callable
 * `setAnonProfileBlock` (Firestore rules deny client writes).
 * Authority key = canonical anon session from chatId (anon_*), verified
 * against Firebase Auth linkage on the chat (initiator/visitor/participantes).
 */
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { db, functions } from "@/lib/firebase";

export type AnonProfileBlockRecord = {
  id: string;
  anonSessionId: string;
  blockedProfileUid: string;
  chatId: string;
  createdAt?: unknown;
};

export function canonicalAnonSessionFromChatId(chatId: string): string {
  if (!isProfileAnonChatId(chatId)) return "";
  const senderId = parseProfileAnonChatId(chatId).senderId;
  return senderId.startsWith("anon_") ? senderId : "";
}

export function anonProfileBlockDocId(anonSessionId: string, profileUid: string) {
  const anon = String(anonSessionId || "").trim();
  const uid = String(profileUid || "").trim();
  if (!anon || !uid) return "";
  return `${anon}__${uid}`;
}

async function callSetAnonProfileBlock(input: {
  chatId: string;
  anonSessionId: string;
  blocked: boolean;
}) {
  await ensureStorageAuth({ allowAnonymous: true });
  const callable = httpsCallable<
    { chatId: string; anonSessionId: string; blocked: boolean },
    { ok: boolean; blocked: boolean }
  >(functions, "setAnonProfileBlock");
  await callable({
    chatId: input.chatId,
    anonSessionId: input.anonSessionId,
    blocked: input.blocked,
  });
}

export async function setAnonBlocksProfile(input: {
  anonSessionId: string;
  blockedProfileUid: string;
  chatId: string;
}) {
  const anonSessionId = String(input.anonSessionId || "").trim();
  const blockedProfileUid = String(input.blockedProfileUid || "").trim();
  const chatId = String(input.chatId || "").trim();
  const fromChat = canonicalAnonSessionFromChatId(chatId);
  if (!anonSessionId.startsWith("anon_") || !blockedProfileUid || !fromChat) {
    throw new Error("invalid_block_identity");
  }
  if (anonSessionId !== fromChat) {
    throw new Error("anon_identity_mismatch");
  }

  await callSetAnonProfileBlock({ chatId, anonSessionId, blocked: true });
  return { id: chatId };
}

export async function clearAnonBlocksProfile(input: {
  anonSessionId: string;
  blockedProfileUid: string;
  chatId: string;
}) {
  const anonSessionId = String(input.anonSessionId || "").trim();
  const fromChat = canonicalAnonSessionFromChatId(input.chatId);
  if (!anonSessionId || anonSessionId !== fromChat) {
    throw new Error("anon_identity_mismatch");
  }
  const chatId = String(input.chatId || "").trim();
  if (!chatId) throw new Error("invalid_block_identity");

  await callSetAnonProfileBlock({ chatId, anonSessionId, blocked: false });
  return { id: chatId };
}

export async function isProfileBlockedByAnon(input: {
  anonSessionId: string;
  profileUid: string;
  chatId?: string;
}): Promise<boolean> {
  const chatId = String(input.chatId || "").trim();
  if (chatId) {
    const chatScoped = await getDoc(doc(db, "anon_profile_blocks", chatId));
    if (chatScoped.exists()) return true;
  }
  const id = anonProfileBlockDocId(input.anonSessionId, input.profileUid);
  if (!id) return false;
  const snap = await getDoc(doc(db, "anon_profile_blocks", id));
  return snap.exists();
}
