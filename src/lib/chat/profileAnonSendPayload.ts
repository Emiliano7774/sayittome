import { serverTimestamp } from "firebase/firestore";

import type { ProfileAnonSenderKind } from "@/lib/chat/profileAnonMessageAuthor";

export type ProfileAnonSendPayloadMode = "production" | "emulator";

export type BuildProfileAnonMessagePayloadInput = {
  messageText: string;
  senderAuthorId: string;
  senderKind: ProfileAnonSenderKind;
  senderRole: ProfileAnonSenderKind;
  senderProfileId?: string | null;
  abuseSendPermitId?: string;
  /** Profile-owner replies only — never on visitor anon payloads readable by receptor. */
  persistAuthUid?: string;
  senderAuthUid?: string;
  profileUid?: string;
  type?: "text" | "audio" | "image" | "video";
  mode?: ProfileAnonSendPayloadMode;
  createdAt?: Date;
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
  mode?: ProfileAnonSendPayloadMode;
  activityAt?: Date;
  /** Emulator/rules matrix: literal +1 instead of FieldValue.increment. */
  unreadLiteralOne?: boolean;
};

function resolveActivityAt(mode: ProfileAnonSendPayloadMode, activityAt?: Date) {
  if (mode === "emulator") return activityAt ?? new Date();
  return serverTimestamp();
}

/** Outgoing chat merge payload — mirrors persistAnonMessage chatWritePayload shape. */
export function buildProfileAnonChatWritePayload(input: BuildProfileAnonChatWritePayloadInput) {
  const mode = input.mode ?? "production";
  const activityAt = resolveActivityAt(mode, input.activityAt);
  const unreadRecipients = input.unreadRecipients.filter(Boolean);

  if (mode === "emulator" || input.unreadLiteralOne) {
    const at = activityAt instanceof Date ? activityAt : new Date();
    const patch: Record<string, unknown> = {
      lastMessage: input.lastMessage,
      lastMessageSender: input.senderAuthorId,
      updatedAt: at,
      lastMessageAt: at,
      latestMessageId: input.latestMessageId,
      latestSenderKind: input.latestSenderKind,
      latestSenderAnonSessionId: input.latestSenderAnonSessionId || "",
      typing: { [input.senderAuthorId]: false },
      readBy: { [input.senderAuthorId]: true } as Record<string, boolean>,
      unreadCounts: {} as Record<string, number>,
    };
    for (const recipientUid of unreadRecipients) {
      const keys =
        recipientUid.startsWith("anon_") || recipientUid.startsWith("profile_")
          ? [recipientUid]
          : [recipientUid, `profile_${recipientUid}`];
      for (const key of keys) {
        (patch.readBy as Record<string, boolean>)[key] = false;
        (patch.unreadCounts as Record<string, number>)[key] = 1;
      }
    }
    const expanded = { ...patch };
    if (input.targetPhoto != null) expanded.targetPhoto = input.targetPhoto;
    expanded.senderIsAnonymous = input.senderIsAnonymous;
    return expanded;
  }

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

/** Message birth payload — visitor anon omits public auth uid fields. */
export function buildProfileAnonMessagePayload(input: BuildProfileAnonMessagePayloadInput) {
  const mode = input.mode ?? "production";
  const isOwnerReply = input.senderKind === "profile";
  const createdAt =
    mode === "emulator" ? (input.createdAt ?? new Date()) : serverTimestamp();

  return {
    texto: input.messageText,
    text: input.messageText,
    createdAt,
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
  mode?: ProfileAnonSendPayloadMode;
  activityAt?: Date;
  createdAt?: Date;
}): ProfileAnonAtomicSendBatch {
  const mode = input.mode ?? "production";
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
      mode,
      activityAt: input.activityAt,
      unreadLiteralOne: mode === "emulator",
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
      mode,
      createdAt: input.createdAt,
    }),
  };
}
