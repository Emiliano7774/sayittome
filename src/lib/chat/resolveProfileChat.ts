import { auth } from "@/lib/firebase";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { migrateToCanonicalChat } from "@/lib/chat/migrate";
import { registerSessionChat } from "@/lib/chat/sessionChats";

export type ResolvedProfileChat = {
  chatId: string;
  senderId: string;
  username: string;
  targetUid: string;
  isLoggedIn: boolean;
};

export async function fetchProfileByUsername(username: string) {
  const res = await fetch(`/api/profile/${encodeURIComponent(username)}?ts=${Date.now()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json?.profile || null;
}

export async function resolveProfileChat(username: string): Promise<ResolvedProfileChat> {
  const profile = await fetchProfileByUsername(username);
  const targetUid = String(profile?.uid || "");
  const firebaseUid = auth.currentUser?.uid || "";
  const senderId = firebaseUid || getAnonSessionId();
  const isLoggedIn = Boolean(firebaseUid);

  const chatId = buildProfileAnonChatId(senderId, username);
  const legacyIds = buildLegacyProfileChatIds(senderId, username, targetUid);

  const participantes = Array.from(
    new Set(
      [senderId, firebaseUid, targetUid].filter(Boolean) as string[],
    ),
  );

  await migrateToCanonicalChat(chatId, legacyIds, {
    id: chatId,
    canonicalChatId: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: targetUid || null,
    targetUid: targetUid || null,
    initiatorUid: firebaseUid || null,
    anonOwnerUid: firebaseUid || null,
    anonSessionId: isLoggedIn ? null : senderId,
    participantes,
    anon: true,
    schemaVersion: 2,
  });

  if (!isLoggedIn) {
    registerSessionChat(chatId);
  }

  return {
    chatId,
    senderId,
    username,
    targetUid,
    isLoggedIn,
  };
}
