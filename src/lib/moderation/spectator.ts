import type { Timestamp } from "firebase/firestore";

import { isProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isProfileReplyAuthorId,
  profileReplyAuthorId,
} from "@/lib/chat/profileAnonMessageAuthor";
import { formatTimeAgo } from "@/lib/time";

import {
  getModerationChatPeerLabel,
  resolveModerationParticipants,
} from "./chatReview";
import type { ModerationChatRow } from "./types";

export type SpectatorMessage = {
  id: string;
  text?: string;
  texto?: string;
  type?: string;
  fromUid?: string;
  ownerId?: string;
  senderUid?: string;
  senderId?: string;
  senderUsername?: string;
  senderIsAnonymous?: boolean;
  senderKind?: string;
  createdAt?: Timestamp;
};

export type SpectatorMessageSide = "profile" | "peer";

export function formatRelativeActivity(ms: number) {
  if (!ms) return "—";
  return formatTimeAgo(new Date(ms));
}

export function messageDisplayText(msg: SpectatorMessage) {
  const text = String(msg.text || msg.texto || "").trim();
  if (text) return text;
  const type = String(msg.type || "text").trim();
  if (type === "image" || type === "photo") return "📷 Foto";
  if (type === "audio" || type === "voice") return "🎤 Audio";
  return `[${type}]`;
}

export function messagesChronological(messages: SpectatorMessage[]) {
  return [...messages].sort((a, b) => {
    const left = a.createdAt?.toMillis?.() ?? 0;
    const right = b.createdAt?.toMillis?.() ?? 0;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });
}

export function getSpectatorPeerLabel(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  return resolveModerationParticipants(chat, profileUsername).peerLabel;
}

function messageAuthorId(msg: SpectatorMessage) {
  return String(
    msg.fromUid || msg.ownerId || msg.senderUid || msg.senderId || "",
  ).trim();
}

function profileUidsForChat(
  chat: ModerationChatRow,
  profileUsername: string,
  profileUid?: string,
) {
  const profile = profileUsername.toLowerCase();
  const isTarget = String(chat.targetUsername || "").toLowerCase() === profile;
  const isReceptor =
    String(chat.receptorUsername || "").toLowerCase() === profile;

  const ids = new Set<string>();
  if (profileUid) ids.add(profileUid);
  if (isTarget && chat.targetUid) ids.add(chat.targetUid);
  if (isReceptor && chat.receptorUid) ids.add(chat.receptorUid);
  if (profileUid) ids.add(profileReplyAuthorId(profileUid));
  return ids;
}

function peerUidsForChat(chat: ModerationChatRow, profileUsername: string) {
  const profile = profileUsername.toLowerCase();
  const isTarget = String(chat.targetUsername || "").toLowerCase() === profile;
  const ids = new Set<string>();

  if (isTarget) {
    if (chat.receptorUid) ids.add(chat.receptorUid);
    if (chat.initiatorUid) ids.add(chat.initiatorUid);
    if (chat.anonOwnerUid) ids.add(chat.anonOwnerUid);
  } else {
    if (chat.targetUid) ids.add(chat.targetUid);
    if (chat.initiatorUid) ids.add(chat.initiatorUid);
    if (chat.anonOwnerUid) ids.add(chat.anonOwnerUid);
  }

  return ids;
}

export function resolveSpectatorMessageSide(
  msg: SpectatorMessage,
  chat: ModerationChatRow,
  profileUsername: string,
  profileUid?: string,
): SpectatorMessageSide {
  const from = messageAuthorId(msg);
  const profileLower = profileUsername.toLowerCase();
  const profileIds = profileUidsForChat(chat, profileUsername, profileUid);
  const peerIds = peerUidsForChat(chat, profileUsername);

  const anonThread =
    isProfileAnonChatId(chat.id) ||
    chat.anon ||
    chat.senderIsAnonymous ||
    (String(chat.targetUsername || "").toLowerCase() === profileLower &&
      String(chat.targetUsername || "").toLowerCase() ===
        String(chat.receptorUsername || "").toLowerCase());

  if (anonThread) {
    const anonId = getProfileChatAnonSenderId(chat.id, chat.anonSessionId);

    if (msg.senderKind === "profile") return "profile";
    if (msg.senderKind === "anon" || msg.senderKind === "anonimo") return "peer";

    if (from && (from === anonId || from.startsWith("anon_"))) return "peer";
    if (from && (profileIds.has(from) || isProfileReplyAuthorId(from))) {
      return "profile";
    }
    if (msg.senderIsAnonymous) return "peer";

    const senderName = String(msg.senderUsername || "").trim().toLowerCase();
    if (senderName && senderName === profileLower) return "profile";
  }

  if (from && profileIds.has(from)) return "profile";
  if (from && peerIds.has(from)) return "peer";

  const senderName = String(msg.senderUsername || "").trim().toLowerCase();
  if (senderName && senderName === profileLower) return "profile";

  if (msg.senderIsAnonymous || msg.senderKind === "anonimo") {
    return "peer";
  }

  const lastSender = String(chat.lastMessageSender || "").trim();
  if (from && lastSender && from === lastSender) {
    if (profileIds.has(lastSender) || isProfileReplyAuthorId(lastSender)) {
      return "profile";
    }
    if (peerIds.has(lastSender)) return "peer";
  }

  return "peer";
}

export function spectatorMessageSenderLabel(
  msg: SpectatorMessage,
  chat: ModerationChatRow,
  profileUsername: string,
  profileUid?: string,
) {
  const side = resolveSpectatorMessageSide(msg, chat, profileUsername, profileUid);
  if (side === "profile") return profileUsername;

  return getModerationChatPeerLabel(chat, profileUsername);
}

export function formatMessageTime(msg: SpectatorMessage) {
  const ms = msg.createdAt?.toMillis?.() ?? 0;
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
