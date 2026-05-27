import { auth } from "@/lib/firebase";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { maybeMigrateExistingProfileChat } from "@/lib/chat/migrate";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";

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
  const senderId = getChatAnonSenderId();
  const isLoggedIn = Boolean(firebaseUid);

  const chatId = buildProfileAnonChatId(senderId, username);
  const legacyIds = [
    ...buildLegacyProfileChatIds(senderId, username, targetUid),
    ...(firebaseUid
      ? buildLegacyProfileChatIds(firebaseUid, username, targetUid)
      : []),
  ];

  const participantes = Array.from(
    new Set(
      [senderId, firebaseUid, targetUid].filter(Boolean) as string[],
    ),
  );

  const targetPhoto = resolveProfilePhoto(profile);

  await maybeMigrateExistingProfileChat(chatId, legacyIds, {
    id: chatId,
    canonicalChatId: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: targetUid || null,
    targetUid: targetUid || null,
    initiatorUid: firebaseUid || null,
    anonOwnerUid: firebaseUid || null,
    anonSessionId: senderId,
    participantes,
    anon: true,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
  });

  return {
    chatId,
    senderId,
    username,
    targetUid,
    isLoggedIn,
  };
}
