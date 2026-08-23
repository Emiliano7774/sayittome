import { httpsCallable } from "firebase/functions";

import {
  decideOfficialProfileLinkRender,
  readAttestationHint,
  type OfficialProfileLinkMessageInput,
  type OfficialProfileLinkVerifyResult,
} from "@/lib/chat/officialProfileLinkMessage";
import { functions } from "@/lib/firebase";

export const VERIFY_VERIFIED_PROFILE_LINK = "verifyVerifiedProfileLink";

export type VerifiedProfileLinkVerifyKey = {
  chatId: string;
  messageId: string;
  ticketId: string;
  text: string;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export function verifiedProfileLinkVerifyKey(input: VerifiedProfileLinkVerifyKey) {
  return [asId(input.chatId), asId(input.messageId), asId(input.ticketId), asId(input.text)].join(
    "\u0001",
  );
}

/** In-memory only. Never session/local/Firestore. Cleared on remount via hook. */
export function createVerifiedProfileLinkVerifyMemory() {
  const memory = new Map<string, OfficialProfileLinkVerifyResult>();
  return {
    get(key: string): OfficialProfileLinkVerifyResult {
      return memory.has(key) ? memory.get(key)! : null;
    },
    set(key: string, value: OfficialProfileLinkVerifyResult) {
      memory.set(key, value);
    },
    clear() {
      memory.clear();
    },
    persistable() {
      return false;
    },
  };
}

export function buildVerifiedProfileLinkVerifyRequest(message: OfficialProfileLinkMessageInput) {
  const hint = readAttestationHint(message.verifiedProfileAttestation);
  const chatId = asId(message.chatId);
  const messageId = asId(message.id);
  if (!hint || !chatId || !messageId || message.deletedForEveryone) return null;
  return {
    chatId,
    messageId,
    ticketId: hint.ticketId,
    text: asId(message.text ?? message.texto),
  };
}

export async function callVerifyVerifiedProfileLink(
  input: { chatId: string; messageId: string; ticketId: string },
  callVerify?: (payload: {
    chatId: string;
    messageId: string;
    ticketId: string;
  }) => Promise<{ ok?: boolean; username?: string }>,
): Promise<OfficialProfileLinkVerifyResult> {
  try {
    const data = callVerify
      ? await callVerify(input)
      : (
          await httpsCallable<
            { chatId: string; messageId: string; ticketId: string },
            { ok?: boolean; username?: string }
          >(
            functions,
            VERIFY_VERIFIED_PROFILE_LINK,
          )(input)
        ).data;
    const username = asId(data?.username);
    if (data?.ok === true && username) return { ok: true, username };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function resolveOfficialProfileLinkAfterVerify(
  message: OfficialProfileLinkMessageInput,
  verifyResult: OfficialProfileLinkVerifyResult,
) {
  return decideOfficialProfileLinkRender(message, verifyResult);
}
