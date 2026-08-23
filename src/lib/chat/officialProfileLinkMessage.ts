import { resolveFirestoreMessageType } from "@/lib/chat/profileAnonMessageAuthor";
import {
  parseExactOfficialProfileLinkMessage,
  type ParsedVerifiedProfileLink,
} from "@/lib/profile/verifiedLink";

export type OfficialProfileLinkMessageInput = {
  text?: string;
  texto?: string;
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  mediaType?: string;
  source?: "camera" | "gallery" | "audio";
  deletedForEveryone?: boolean;
};

/**
 * Shared sender/receiver render contract.
 * Text without media (including omitted Firestore `type`) can become a card.
 * Media and deleted-for-everyone never do.
 */
export function decideOfficialProfileLinkRender(
  message: OfficialProfileLinkMessageInput,
): ParsedVerifiedProfileLink | null {
  if (message.deletedForEveryone) return null;
  const type = resolveFirestoreMessageType(message);
  if (type !== "text") return null;
  return parseExactOfficialProfileLinkMessage(String(message.text ?? message.texto ?? ""));
}
