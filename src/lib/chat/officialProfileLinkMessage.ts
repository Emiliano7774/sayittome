import { resolveFirestoreMessageType } from "@/lib/chat/profileAnonMessageAuthor";
import {
  getOfficialProfileInAppHref,
  getVerifiedProfileUrl,
  parseExactOfficialProfileLinkMessage,
  type ParsedVerifiedProfileLink,
} from "@/lib/profile/verifiedLink";

export type OfficialProfileLinkVerifyResult =
  | { ok: true; username: string }
  | { ok: false }
  | null;

export type OfficialProfileLinkMessageInput = {
  id?: string;
  chatId?: string;
  text?: string;
  texto?: string;
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  mediaType?: string;
  source?: "camera" | "gallery" | "audio";
  deletedForEveryone?: boolean;
  verifiedProfileAttestation?: unknown;
  verified?: unknown;
  official?: unknown;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

/**
 * Untrusted hint only. A complete forged object still only yields a ticketId
 * for a backend verify call — never a badge.
 */
export function readAttestationHint(raw: unknown): { ticketId: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ticketId = asId((raw as { ticketId?: unknown }).ticketId);
  if (!ticketId || ticketId.length < 32) return null;
  return { ticketId };
}

/**
 * Fail-closed render. Raw Firestore attestation never grants a badge.
 * `verifyResult` must be a positive backend verify for this message.
 */
export function decideOfficialProfileLinkRender(
  message: OfficialProfileLinkMessageInput,
  verifyResult: OfficialProfileLinkVerifyResult = null,
): ParsedVerifiedProfileLink | null {
  if (message.deletedForEveryone) return null;
  const type = resolveFirestoreMessageType(message);
  if (type !== "text") return null;
  if (!verifyResult || verifyResult.ok !== true) return null;

  const username = asId(verifyResult.username).replace(/^@/, "").toLowerCase();
  if (!username) return null;

  const text = asId(message.text ?? message.texto);
  if (text !== getVerifiedProfileUrl(username)) return null;

  const hint = readAttestationHint(message.verifiedProfileAttestation);
  if (!hint) return null;

  const parsed = parseExactOfficialProfileLinkMessage(text);
  if (!parsed || parsed.username !== username) return null;

  return {
    username,
    profileHref: getOfficialProfileInAppHref(username),
    displayLink: parsed.displayLink,
    matchedText: text,
  };
}
