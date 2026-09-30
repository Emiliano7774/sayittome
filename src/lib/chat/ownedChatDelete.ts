import { safeChatPart, usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";

const OWN_UID_FIELDS = [
  "receptorUid",
  "targetUid",
  "anonOwnerUid",
  "ownerUid",
  "profileUid",
] as const;

export function exactChatId(value: unknown) {
  const chatId = String(value || "").trim();
  if (!chatId || chatId.length > 180 || chatId.includes("/") || chatId.includes("\\")) return "";
  return chatId;
}

function uidList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

/** Profile owner only. A chat id by itself is not authority. */
export function callerOwnsInboxChat(input: {
  uid: string;
  username?: string;
  usernameLower?: string;
  chatId: string;
  data: Record<string, unknown> | null;
}) {
  const uid = String(input.uid || "").trim();
  if (!uid || !input.data) return false;

  for (const key of OWN_UID_FIELDS) {
    if (String(input.data[key] || "").trim() === uid) return true;
  }

  const participants = [
    ...uidList(input.data.participantes),
    ...uidList(input.data.participants),
  ];
  if (participants.includes(uid)) return true;

  const hint = usernameHintFromAnonChatId(input.chatId);
  if (!hint) return false;
  // Only the caller's username may match the chatId hint. The document's
  // targetUsername is always that hint for a profile-anon thread, so using it
  // here let the visitor delete the receptor's chat.
  return [input.username, input.usernameLower].some((value) => {
    const raw = String(value || "").trim();
    return Boolean(raw) && safeChatPart(raw) === hint;
  });
}

/** Visitor who started the thread, proven by the private chat lease. */
export function callerStartedAnonVisitorChat(input: {
  uid: string;
  leaseVisitorAuthUid?: string | null;
}) {
  const uid = String(input.uid || "").trim();
  const bound = String(input.leaseVisitorAuthUid || "").trim();
  return Boolean(uid && bound && uid === bound);
}

export function callerCanDeleteInboxChat(input: {
  uid: string;
  username?: string;
  usernameLower?: string;
  chatId: string;
  data: Record<string, unknown> | null;
  leaseVisitorAuthUid?: string | null;
}) {
  return (
    callerOwnsInboxChat(input) ||
    callerStartedAnonVisitorChat({
      uid: input.uid,
      leaseVisitorAuthUid: input.leaseVisitorAuthUid,
    })
  );
}
