/**
 * Durable anon → profile block. Authority key = canonical anon session from chatId
 * (anon_*), not an arbitrary client-supplied peer id for the blocked party.
 * Lasts until the anon unblocks or changes identity (new anon session / chatId).
 */
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { db } from "@/lib/firebase";

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
  // Authority: client session must match the canonical anon baked into chatId.
  if (anonSessionId !== fromChat) {
    throw new Error("anon_identity_mismatch");
  }

  const id = anonProfileBlockDocId(anonSessionId, blockedProfileUid);
  await setDoc(
    doc(db, "anon_profile_blocks", id),
    {
      anonSessionId,
      blockedProfileUid,
      chatId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { id };
}

export async function clearAnonBlocksProfile(input: {
  anonSessionId: string;
  blockedProfileUid: string;
  chatId: string;
}) {
  const anonSessionId = String(input.anonSessionId || "").trim();
  const blockedProfileUid = String(input.blockedProfileUid || "").trim();
  const fromChat = canonicalAnonSessionFromChatId(input.chatId);
  if (!anonSessionId || anonSessionId !== fromChat) {
    throw new Error("anon_identity_mismatch");
  }
  const id = anonProfileBlockDocId(anonSessionId, blockedProfileUid);
  if (!id) throw new Error("invalid_block_identity");
  await deleteDoc(doc(db, "anon_profile_blocks", id));
  return { id };
}

export async function isProfileBlockedByAnon(input: {
  anonSessionId: string;
  profileUid: string;
}): Promise<boolean> {
  const id = anonProfileBlockDocId(input.anonSessionId, input.profileUid);
  if (!id) return false;
  const snap = await getDoc(doc(db, "anon_profile_blocks", id));
  return snap.exists();
}
