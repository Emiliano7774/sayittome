import { serverTimestamp } from "firebase/firestore";

import type { ProfileAnonSenderKind } from "@/lib/chat/profileAnonMessageAuthor";
import {
  buildOutgoingChatMetaPatch,
  expandOutgoingChatMetaPatchForSet,
} from "@/lib/chat/outgoingChatMeta";

export type BuildProfileAnonMessagePayloadInput = {
  messageText: string;
  senderAuthorId: string;
  senderKind: ProfileAnonSenderKind;
  senderRole: ProfileAnonSenderKind;
  senderProfileId?: string | null;
  abuseSendPermitId?: string;
  /** Profile-owner replies only â€” never on visitor anon payloads readable by receptor. */
  persistAuthUid?: string;
  senderAuthUid?: string;
  profileUid?: string;
  type?: "text" | "audio" | "image" | "video" | "profile";
};

export type BuildProfileAnonChatWritePayloadInput = {
  senderAuthorId: string;
  unreadRecipients: string[];
  lastMessage: string;
  latestMessageId: string;
  latestSenderKind: ProfileAnonSenderKind;
  latestSenderAnonSessionId?: string;
  senderIsAnonymous: boolean;
  targetPhoto?: string | null;
};

/** Outgoing chat merge payload â€” mirrors persistAnonMessage chatWritePayload shape. */
export function buildProfileAnonChatWritePayload(input: BuildProfileAnonChatWritePayloadInput) {
  const unreadRecipients = input.unreadRecipients.filter(Boolean);
  const patch = expandOutgoingChatMetaPatchForSet(
    buildOutgoingChatMetaPatch(input.senderAuthorId, unreadRecipients, {
      lastMessage: input.lastMessage,
      lastMessageSender: input.senderAuthorId,
      latestMessageId: input.latestMessageId,
      latestSenderKind: input.latestSenderKind,
      latestSenderAnonSessionId: input.latestSenderAnonSessionId || "",
    }),
  );
  return {
    ...patch,
    ...(input.targetPhoto != null ? { targetPhoto: input.targetPhoto } : {}),
    senderIsAnonymous: input.senderIsAnonymous,
  };
}

/** Message birth payload â€” visitor anon omits public auth uid fields. */
export function buildProfileAnonMessagePayload(input: BuildProfileAnonMessagePayloadInput) {
  const isOwnerReply = input.senderKind === "profile";

  return {
    texto: input.messageText,
    text: input.messageText,
    createdAt: serverTimestamp(),
    fromUid: input.senderAuthorId,
    ownerId: input.senderAuthorId,
    senderKind: input.senderKind,
    ...(isOwnerReply
      ? {
          senderAuthUid: input.senderAuthUid || input.persistAuthUid || null,
          createdByAuthUid: input.persistAuthUid || null,
        }
      : {}),
    senderProfileId: input.senderProfileId ?? null,
    senderRole: input.senderRole,
    identityReadyAtWrite: true,
    ...(input.abuseSendPermitId ? { abuseSendPermitId: input.abuseSendPermitId } : {}),
    ...(isOwnerReply && input.profileUid ? { profileUid: input.profileUid } : {}),
    readBy: { [input.senderAuthorId]: true },
    type: input.type ?? "text",
  };
}

export type ProfileAnonAtomicSendBatch = {
  chatWritePayload: Record<string, unknown>;
  messagePayload: Record<string, unknown>;
};

export function buildProfileAnonAtomicSendBatch(input: {
  messageText: string;
  lastMessage?: string;
  messageId: string;
  senderAuthorId: string;
  senderKind: ProfileAnonSenderKind;
  senderRole: ProfileAnonSenderKind;
  unreadRecipients: string[];
  latestSenderAnonSessionId?: string;
  senderIsAnonymous: boolean;
  abuseSendPermitId?: string;
  persistAuthUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string | null;
  profileUid?: string;
}): ProfileAnonAtomicSendBatch {
  const preview = input.lastMessage ?? input.messageText;
  return {
    chatWritePayload: buildProfileAnonChatWritePayload({
      senderAuthorId: input.senderAuthorId,
      unreadRecipients: input.unreadRecipients,
      lastMessage: preview,
      latestMessageId: input.messageId,
      latestSenderKind: input.senderKind,
      latestSenderAnonSessionId: input.latestSenderAnonSessionId,
      senderIsAnonymous: input.senderIsAnonymous,
    }),
    messagePayload: buildProfileAnonMessagePayload({
      messageText: input.messageText,
      senderAuthorId: input.senderAuthorId,
      senderKind: input.senderKind,
      senderRole: input.senderRole,
      senderProfileId: input.senderProfileId,
      abuseSendPermitId: input.abuseSendPermitId,
      persistAuthUid: input.persistAuthUid,
      senderAuthUid: input.senderAuthUid,
      profileUid: input.profileUid,
    }),
  };
}
