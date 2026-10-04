/**
 * Temp-chat whip: only a brand-new inbound message after the listener
 * has a baseline. Snapshot remounts and own sends stay silent.
 */
export function shouldWhipAnonDirectIncoming(input: {
  senderId: string;
  fromId: string;
  messageId: string;
  lastWhipMessageId: string | null;
  bootstrapped: boolean;
}) {
  const senderId = String(input.senderId || "").trim();
  const fromId = String(input.fromId || "").trim();
  const messageId = String(input.messageId || "").trim();

  if (!input.bootstrapped) {
    return { whip: false, nextLastId: messageId || null, nextBootstrapped: true };
  }

  if (!senderId || !messageId || messageId === input.lastWhipMessageId) {
    return {
      whip: false,
      nextLastId: messageId || input.lastWhipMessageId,
      nextBootstrapped: true,
    };
  }

  return {
    whip: Boolean(fromId) && fromId !== senderId,
    nextLastId: messageId,
    nextBootstrapped: true,
  };
}

/** Incoming match requests must not whip while a temp chat is already open. */
export function shouldAlertIncomingAnonMatchRequest(input: {
  requestId: string;
  alreadyAlerted: boolean;
  chatOpen: boolean;
}) {
  if (input.chatOpen) return false;
  if (input.alreadyAlerted) return false;
  return Boolean(String(input.requestId || "").trim());
}
