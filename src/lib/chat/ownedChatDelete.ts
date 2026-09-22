import { usernameHintFromAnonChatId } from "@/lib/chat/anonChatId";

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
  const username = String(input.username || "").trim().toLowerCase();
  return Boolean(hint && username && hint === username);
}
