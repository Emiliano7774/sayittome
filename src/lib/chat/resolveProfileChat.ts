import { auth } from "@/lib/firebase";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
  parseProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { findOwnerIncomingChat } from "@/lib/chat/findOwnerIncomingChat";
import { maybeMigrateExistingProfileChat } from "@/lib/chat/migrate";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import {
  getCachedFullProfile,
  setCachedFullProfile,
} from "@/lib/profile/profileCache";

export type ResolvedProfileChat = {
  chatId: string;
  senderId: string;
  username: string;
  targetUid: string;
  targetPhoto: string;
  isLoggedIn: boolean;
};

export async function fetchProfileByUsername(username: string, force = false) {
  const key = username.trim().toLowerCase();
  if (!force) {
    const cached = getCachedFullProfile(key);
    if (cached) return cached;
  }

  const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
  const json = await res.json();
  const profile = json?.profile || null;
  if (profile) setCachedFullProfile(key, profile);
  return profile;
}

const profileChatCache = new Map<string, Promise<ResolvedProfileChat>>();

export async function resolveProfileChat(username: string): Promise<ResolvedProfileChat> {
  const key = username.trim().toLowerCase();
  if (!key) {
    throw new Error("missing_profile_username");
  }

  const cached = profileChatCache.get(key);
  if (cached) return cached;

  const promise = resolveProfileChatUncached(username).catch((error) => {
    profileChatCache.delete(key);
    throw error;
  });

  profileChatCache.set(key, promise);
  return promise;
}

async function resolveProfileChatUncached(username: string): Promise<ResolvedProfileChat> {
  const profile = await fetchProfileByUsername(username);
  const targetUid = String(profile?.uid || "");
  const firebaseUid = auth.currentUser?.uid || "";
  const senderId = getChatAnonSenderId();
  const isLoggedIn = Boolean(firebaseUid);

  let chatId = buildProfileAnonChatId(senderId, username);

  if (firebaseUid && targetUid && firebaseUid === targetUid) {
    const incoming = await findOwnerIncomingChat(firebaseUid, username);
    if (incoming?.id) {
      chatId = incoming.id;
    }
  }

  const effectiveSender = parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
    ? parseProfileAnonChatId(chatId).senderId
    : senderId;
  const legacyIds = [
    ...buildLegacyProfileChatIds(effectiveSender, username, targetUid),
    ...(firebaseUid
      ? buildLegacyProfileChatIds(firebaseUid, username, targetUid)
      : []),
    ...(effectiveSender !== senderId
      ? buildLegacyProfileChatIds(senderId, username, targetUid)
      : []),
  ];

  const participantes = Array.from(
    new Set(
      [effectiveSender, senderId, firebaseUid, targetUid].filter(Boolean) as string[],
    ),
  );

  const targetPhoto = resolveProfilePhoto(profile);

  const migrationMeta = {
    id: chatId,
    canonicalChatId: chatId,
    targetUsername: username,
    receptorUsername: username,
    receptorUid: targetUid || null,
    targetUid: targetUid || null,
    initiatorUid: firebaseUid || null,
    anonOwnerUid: targetUid || null,
    anonSessionId: effectiveSender,
    participantes,
    anon: true,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
  };

  void maybeMigrateExistingProfileChat(chatId, legacyIds, migrationMeta).catch((error) => {
    console.error("profile chat migration", error);
  });

  return {
    chatId,
    senderId: effectiveSender,
    username,
    targetUid,
    targetPhoto: targetPhoto || "",
    isLoggedIn,
  };
}
