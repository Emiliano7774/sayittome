import {
  isProfileAnonChatId,
  parseProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { formatAnonSessionLabel } from "@/lib/chat/inboxPeerTitle";

import type { ModerationChatRow } from "./types";

export type ModerationParticipants = {
  profileUsername: string;
  peerLabel: string;
  peerIsAnon: boolean;
  /** One line: who is talking to whom */
  headline: string;
  /** Bubble legend for moderators */
  directionHint: string;
};

function profileMatches(value: string, profileUsername: string) {
  return String(value || "").trim().toLowerCase() === profileUsername.toLowerCase().trim();
}

function bothSidesSameProfile(chat: ModerationChatRow, profileUsername: string) {
  const target = String(chat.targetUsername || "").trim();
  const receptor = String(chat.receptorUsername || "").trim();
  if (!target || !receptor) return false;
  return (
    target.toLowerCase() === receptor.toLowerCase() &&
    profileMatches(target, profileUsername)
  );
}

function isAnonProfileThread(chat: ModerationChatRow, profileUsername: string) {
  return (
    isProfileAnonChatId(chat.id) ||
    chat.anon === true ||
    chat.senderIsAnonymous === true ||
    bothSidesSameProfile(chat, profileUsername)
  );
}

export function resolveAnonVisitorLabel(chat: ModerationChatRow) {
  const fromDoc = String(chat.anonSessionId || "").trim();
  const fromId =
    (fromDoc.startsWith("anon_") ? fromDoc : "") ||
    (isProfileAnonChatId(chat.id) ? parseProfileAnonChatId(chat.id).senderId : "") ||
    getProfileChatAnonSenderId(chat.id, chat.anonSessionId);

  return formatAnonSessionLabel(fromId) || "Visitante anónimo";
}

export function resolveModerationParticipants(
  chat: ModerationChatRow,
  profileUsername: string,
): ModerationParticipants {
  const profile = String(profileUsername || "").trim() || "Perfil";

  if (isAnonProfileThread(chat, profile)) {
    const peerLabel = resolveAnonVisitorLabel(chat);
    return {
      profileUsername: profile,
      peerLabel,
      peerIsAnon: true,
      headline: `${peerLabel} escribió a ${profile}`,
      directionHint: `← ${peerLabel} (visitante) · → ${profile} (dueño del perfil)`,
    };
  }

  const peer = getModerationChatPeerLabel(chat, profileUsername);

  return {
    profileUsername: profile,
    peerLabel: peer,
    peerIsAnon: false,
    headline: `${peer} ↔ ${profile}`,
    directionHint: `← ${peer} · → ${profile}`,
  };
}

/** Who the reviewed profile is talking to in this thread. */
export function getModerationChatPeerLabel(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  if (isAnonProfileThread(chat, profileUsername)) {
    return resolveAnonVisitorLabel(chat);
  }

  const profile = profileUsername.toLowerCase().trim();
  const target = String(chat.targetUsername || "").trim();
  const receptor = String(chat.receptorUsername || "").trim();
  const targetLower = target.toLowerCase();
  const receptorLower = receptor.toLowerCase();

  const profileIsTarget = targetLower === profile;
  const profileIsReceptor = receptorLower === profile;

  if (profileIsTarget) {
    return receptor || "Interlocutor";
  }

  if (profileIsReceptor) {
    return target || "Interlocutor";
  }

  return target || receptor || "Interlocutor";
}

export function formatModerationChatListTitle(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  const { peerLabel, peerIsAnon, profileUsername: profile } =
    resolveModerationParticipants(chat, profileUsername);

  if (peerIsAnon) {
    return `Anónimo → ${profile}`;
  }

  return `${peerLabel} ↔ ${profile}`;
}

export function formatModerationChatListSubtitle(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  const { peerIsAnon, peerLabel } = resolveModerationParticipants(
    chat,
    profileUsername,
  );

  if (peerIsAnon) {
    return `ID visitante: ${peerLabel}`;
  }

  return getModerationChatPeerLabel(chat, profileUsername);
}
