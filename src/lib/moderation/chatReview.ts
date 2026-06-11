import type { ModerationChatRow } from "./types";

/** Who the reviewed profile is talking to in this thread. */
export function getModerationChatPeerLabel(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  const profile = profileUsername.toLowerCase().trim();
  const target = String(chat.targetUsername || "").trim();
  const receptor = String(chat.receptorUsername || "").trim();
  const targetLower = target.toLowerCase();
  const receptorLower = receptor.toLowerCase();

  const profileIsTarget = targetLower === profile;
  const profileIsReceptor = receptorLower === profile;

  if (profileIsTarget) {
    if (chat.anon || chat.senderIsAnonymous) {
      return receptor || "Anónimo";
    }
    return receptor || "Interlocutor";
  }

  if (profileIsReceptor) {
    if (chat.anon && !target) {
      return "Anónimo";
    }
    return target || "Anónimo";
  }

  if (chat.anon) {
    return target || receptor || "Anónimo";
  }

  return target || receptor || "Interlocutor";
}

export function formatModerationChatListTitle(
  chat: ModerationChatRow,
  profileUsername: string,
) {
  const peer = getModerationChatPeerLabel(chat, profileUsername);
  const anon =
    chat.anon ||
    chat.senderIsAnonymous ||
    peer.toLowerCase() === "anónimo" ||
    peer.toLowerCase() === "anonimo";

  return anon ? `Anónimo` : peer;
}
