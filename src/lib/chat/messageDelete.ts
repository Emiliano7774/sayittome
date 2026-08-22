export { DELETED_MESSAGE_PREVIEW } from "@/lib/chat/messageDeleteServer";

import {
  DELETED_MESSAGE_PREVIEW,
  isCanonicalMessageAuthor,
  isHiddenForAnyKey,
  viewerHideKeys,
} from "@/lib/chat/messageDeleteServer";

export type MessageDeleteAuthorInput = {
  fromUid?: string;
  senderAuthUid?: string;
  senderRole?: string;
  senderKind?: string;
  createdByAuthUid?: string;
  mine?: boolean;
};

export type MessageDeleteViewer = {
  authUid?: string;
  profileUid?: string;
  anonId?: string;
  identityReady?: boolean;
  isOwnerViewing?: boolean;
};

export function viewerHideIdentity(viewer: MessageDeleteViewer) {
  return viewerHideKeys(viewer)[0] || "";
}

export function isHiddenForViewer(
  hiddenFor: Record<string, boolean> | undefined,
  identity: string | string[],
) {
  const keys = Array.isArray(identity) ? identity : [identity];
  return isHiddenForAnyKey(hiddenFor, keys.filter(Boolean));
}

export function applyHideForMe(
  hiddenFor: Record<string, boolean> | undefined,
  identity: string,
) {
  const key = String(identity || "").trim();
  if (!key) return { ...(hiddenFor || {}) };
  if (hiddenFor?.[key] === true) return hiddenFor;
  return { ...(hiddenFor || {}), [key]: true };
}

export function isCanonicalDeleteAuthor(
  message: MessageDeleteAuthorInput,
  viewer: MessageDeleteViewer,
) {
  if (viewer.identityReady === false) return false;
  return isCanonicalMessageAuthor({
    uid: String(viewer.authUid || viewer.profileUid || "").trim(),
    message: {
      fromUid: message.fromUid,
      senderAuthUid: message.senderAuthUid,
      createdByAuthUid: message.createdByAuthUid,
      senderRole: message.senderRole,
      senderKind: message.senderKind,
    },
  });
}

export function tombstoneDeletedMessage() {
  return {
    deletedForEveryone: true as const,
    texto: DELETED_MESSAGE_PREVIEW,
    text: DELETED_MESSAGE_PREVIEW,
    mediaUrl: "",
    type: "text" as const,
    storyReply: undefined,
  };
}

export function shouldKeepDeletedPlaceholder(input: {
  deletedForEveryone?: boolean;
  text?: string;
  mediaUrl?: string;
}) {
  if (input.deletedForEveryone) return true;
  return Boolean(String(input.text || "").trim() || String(input.mediaUrl || "").trim());
}

export type QueuedMessageDelete = {
  id: string;
  chatId: string;
  messageId: string;
  mode: "me" | "everyone";
  identity: string;
  attempts: number;
};

export function enqueueMessageDelete(
  queue: QueuedMessageDelete[],
  next: Omit<QueuedMessageDelete, "attempts">,
) {
  if (queue.some((item) => item.id === next.id)) return queue;
  return [...queue, { ...next, attempts: 0 }];
}

export function markMessageDeleteAttempt(queue: QueuedMessageDelete[], id: string) {
  return queue.map((item) =>
    item.id === id ? { ...item, attempts: item.attempts + 1 } : item,
  );
}

export function removeQueuedMessageDelete(queue: QueuedMessageDelete[], id: string) {
  return queue.filter((item) => item.id !== id);
}

export function deleteOpId(chatId: string, messageId: string, mode: "me" | "everyone") {
  return `${chatId}:${messageId}:${mode}`;
}

export function queuedDeletesForIdentity(
  queue: QueuedMessageDelete[],
  identity: string,
) {
  const uid = String(identity || "").trim();
  if (!uid) return [];
  return queue.filter((item) => String(item.identity || "").trim() === uid);
}
