import type { InboxChat } from "@/hooks/useChatsInbox";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import {
  isIncomingAnonChatForOwner,
  profileAnonSenderFromChat,
} from "@/lib/chat/inboxPeerTitle";
import { isProfileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import {
  listThreadAnonIds,
  rootAnonContinuityId,
  visitorOwnsAnonId,
} from "@/lib/chat/threadAnonContinuity";

export type ChatViewerKind = "anon" | "owner" | "unknown";

export type ChatViewerRole = {
  viewerKind: ChatViewerKind;
  provenOwner: boolean;
};

export type ChatViewerRoleInput = {
  viewerKind?: ChatViewerKind;
  provenOwner?: boolean;
};

export function resolveChatViewerRole(input: {
  viewerId?: string;
  firebaseUid?: string;
  chat?: InboxChat;
  viewerKind?: ChatViewerKind;
  provenOwner?: boolean;
}): ChatViewerRole {
  if (input.provenOwner === true || input.viewerKind === "owner") {
    return { viewerKind: "owner", provenOwner: true };
  }
  if (input.viewerKind === "anon") {
    return { viewerKind: "anon", provenOwner: false };
  }
  if (input.viewerKind === "unknown") {
    return { viewerKind: "unknown", provenOwner: false };
  }

  const uid = String(input.firebaseUid || "").trim();
  if (
    input.chat &&
    uid &&
    !uid.startsWith("anon_") &&
    isIncomingAnonChatForOwner(input.chat, uid)
  ) {
    return { viewerKind: "owner", provenOwner: true };
  }

  const viewerId = String(input.viewerId || "").trim();
  if (viewerId.startsWith("anon_")) {
    return { viewerKind: "anon", provenOwner: false };
  }

  return { viewerKind: "unknown", provenOwner: false };
}

function isAnonVisitorRole(role: ChatViewerRole) {
  return role.viewerKind === "anon" && !role.provenOwner;
}

function continuityScopeForViewer(firebaseUid = "") {
  return {
    authUid: String(firebaseUid || "").trim(),
    rootAnonSessionId: rootAnonContinuityId(),
  };
}

function viewerKnownAnonIds(chat: InboxChat | undefined, firebaseUid = "") {
  if (!chat) {
    const live = getChatAnonSenderId();
    return live.startsWith("anon_") ? [live] : [];
  }
  const threadAnon = profileAnonSenderFromChat(chat);
  const liveAnonId = getChatAnonSenderId();
  return listThreadAnonIds(
    chat.canonicalChatId || chat.id,
    [threadAnon, liveAnonId],
    continuityScopeForViewer(firebaseUid),
  );
}

/**
 * True viewer identity aliases only. Never include peer anon IDs for a profile
 * owner — that poisons unread/mark-read and treats inbound anon replies as "own".
 */
export function collectViewerSenderIds(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
  roleInput?: ChatViewerRoleInput,
) {
  const ids = new Set<string>();
  const add = (value: string) => {
    const id = String(value || "").trim();
    if (id) ids.add(id);
  };

  add(viewerId);

  const role = resolveChatViewerRole({
    viewerId,
    firebaseUid,
    chat,
    viewerKind: roleInput?.viewerKind,
    provenOwner: roleInput?.provenOwner,
  });
  const threadAnon = profileAnonSenderFromChat(chat);
  const liveAnonId = getChatAnonSenderId();
  const viewerIsAnon = isAnonVisitorRole(role);

  // Profile-owner / unknown Firebase viewers keep uid + profile_* aliases.
  // Anon visitors must NOT inherit the browser Firebase uid — that poisons
  // readBy/unreadCounts evaluation for profile replies keyed under anon_*.
  if (!viewerIsAnon) {
    add(firebaseUid);
    if (firebaseUid) add(profileReplyAuthorId(firebaseUid));
  }

  // Continuity A/B/C only proves visitor authorship when the current viewer
  // is actually anonymous. Owner/profile never inherit threadAnon/continuity.
  if (viewerIsAnon) {
    if (viewerId.startsWith("anon_")) add(viewerId);
    if (threadAnon.startsWith("anon_")) add(threadAnon);
    if (liveAnonId.startsWith("anon_")) add(liveAnonId);
    for (const id of viewerKnownAnonIds(chat, firebaseUid)) add(id);
  }

  return ids;
}

export function isOwnChatSender(
  sender: string,
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
  roleInput?: ChatViewerRoleInput,
) {
  const from = String(sender || "").trim();
  if (!from) return true;
  if (from === viewerId) return true;

  const role = resolveChatViewerRole({
    viewerId,
    firebaseUid,
    chat,
    viewerKind: roleInput?.viewerKind,
    provenOwner: roleInput?.provenOwner,
  });
  const viewerIsAnon = isAnonVisitorRole(role);
  const threadAnon = chat ? profileAnonSenderFromChat(chat) : "";

  // Anon visitors must never treat profile_* replies as own — enterAnonymousMode
  // can leave a Firebase uid in the browser while the viewer is anon_*.
  if (viewerIsAnon && isProfileReplyAuthorId(from)) {
    return false;
  }
  if (isProfileReplyAuthorId(from) && threadAnon.startsWith("anon_")) {
    if (!role.provenOwner) {
      return false;
    }
  }

  if (!viewerIsAnon) {
    if (firebaseUid && from === firebaseUid) return true;
    if (firebaseUid && from === profileReplyAuthorId(firebaseUid)) return true;
  }

  if (chat) {
    for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid, role)) {
      if (from === id) return true;
    }
    if (viewerIsAnon) {
      const known = viewerKnownAnonIds(chat, firebaseUid);
      if (from.startsWith("anon_") && visitorOwnsAnonId(from, known)) {
        return true;
      }
      const latestAnon = String(chat.latestSenderAnonSessionId || "").trim();
      if (latestAnon && latestAnon === from && visitorOwnsAnonId(latestAnon, known)) {
        return true;
      }
    }
  }

  return false;
}

export function isOwnInboxLastSender(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
  roleInput?: ChatViewerRoleInput,
) {
  return isOwnChatSender(
    String(chat.lastMessageSender || ""),
    viewerId,
    firebaseUid,
    chat,
    roleInput,
  );
}

export function wasChatReadOnServer(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
  roleInput?: ChatViewerRoleInput,
) {
  const sender = String(chat.lastMessageSender || "").trim();
  const readBy = chat.readBy || {};
  const incomingForViewer =
    isIncomingProfileReplyForAnonVisitor(sender, viewerId, firebaseUid, chat, roleInput) ||
    isIncomingAnonMessageForProfileOwner(sender, firebaseUid, chat, roleInput);

  // Inbound replies must be evaluated before "own last sender ⇒ read". Peer anon
  // IDs used to be misclassified as own and hid unread forever.
  if (incomingForViewer) {
    const viewerIds = [...collectViewerSenderIds(chat, viewerId, firebaseUid, roleInput)];
    // Prefer the inbound recipient keys (anon_* for visitors, firebase/profile_* for owners).
    const primaryIds = viewerIds.filter((id) =>
      viewerId.startsWith("anon_")
        ? id.startsWith("anon_")
        : !id.startsWith("anon_"),
    );
    // Check aliases too — repeat inbound after markChatAsRead may dirty a
    // non-primary key first (or only), and must still clear "read".
    const ids = [...new Set([...primaryIds, ...viewerIds])];

    for (const id of ids) {
      const unread = chat.unreadCounts?.[id];
      if (typeof unread === "number" && unread > 0) return false;
      if (readBy[id] === false) return false;
    }

    // Stale readBy=true from the visitor's own last send must not hide a profile reply.
    // Require an explicit zero-unread + readBy on a primary recipient key.
    const readIds = primaryIds.length > 0 ? primaryIds : viewerIds;
    const explicitlyRead = readIds.some(
      (id) =>
        readBy[id] === true &&
        typeof chat.unreadCounts?.[id] === "number" &&
        chat.unreadCounts[id] === 0,
    );
    return explicitlyRead;
  }

  if (isOwnInboxLastSender(chat, viewerId, firebaseUid, roleInput)) {
    return true;
  }

  if (readBy[viewerId] === true) return true;

  for (const id of collectViewerSenderIds(chat, viewerId, firebaseUid, roleInput)) {
    if (!id.startsWith("anon_")) continue;
    if (readBy[id] === true) return true;
  }

  if (firebaseUid && isIncomingAnonChatForOwner(chat, firebaseUid)) {
    if (readBy[firebaseUid] === true) return true;
    if (readBy[profileReplyAuthorId(firebaseUid)] === true) return true;
  }

  return false;
}

export function isIncomingProfileReplyForAnonVisitor(
  sender: string,
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
  roleInput?: ChatViewerRoleInput,
) {
  const from = String(sender || "").trim();
  if (!from || !isProfileReplyAuthorId(from)) return false;
  const role = resolveChatViewerRole({
    viewerId,
    firebaseUid,
    chat,
    viewerKind: roleInput?.viewerKind,
    provenOwner: roleInput?.provenOwner,
  });
  if (role.provenOwner || role.viewerKind === "owner") return false;
  return isAnonVisitorRole(role);
}

export function isIncomingAnonMessageForProfileOwner(
  sender: string,
  firebaseUid = "",
  chat?: InboxChat,
  roleInput?: ChatViewerRoleInput,
) {
  const from = String(sender || "").trim();
  if (!from.startsWith("anon_") || !firebaseUid) return false;
  const role = resolveChatViewerRole({
    viewerId: firebaseUid,
    firebaseUid,
    chat,
    viewerKind: roleInput?.viewerKind,
    provenOwner: roleInput?.provenOwner,
  });
  if (!role.provenOwner && role.viewerKind !== "owner") return false;
  if (chat) return isIncomingAnonChatForOwner(chat, firebaseUid);
  return true;
}

export function isIncomingChatActivity(
  chat: InboxChat,
  viewerId: string,
  firebaseUid = "",
  roleInput?: ChatViewerRoleInput,
) {
  const preview = String(chat.lastMessage || "").trim();
  const sender = String(chat.lastMessageSender || "").trim();
  if (!preview || !sender || !viewerId) return false;
  if (isIncomingProfileReplyForAnonVisitor(sender, viewerId, firebaseUid, chat, roleInput)) {
    return true;
  }
  if (isIncomingAnonMessageForProfileOwner(sender, firebaseUid, chat, roleInput)) {
    return true;
  }
  return !isOwnInboxLastSender(chat, viewerId, firebaseUid, roleInput);
}

export function chatActivityKey(chat: InboxChat) {
  // Prefer stable latestMessageId — lastMessageAt mutates when serverTimestamp
  // resolves and previously invalidated local read markers (bold stuck).
  const latestMessageId = String(chat.latestMessageId || "").trim();
  if (latestMessageId) return `id:${latestMessageId}`;
  return [
    chat.lastMessage || "",
    chat.lastMessageSender || "",
  ].join("|");
}

export function isIncomingMessageFromDoc(
  data: {
    fromUid?: string;
    ownerId?: string;
    senderUid?: string;
    senderKind?: string;
  },
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
  roleInput?: ChatViewerRoleInput,
) {
  const from = String(data.fromUid || data.ownerId || data.senderUid || "");
  const senderKind = String(data.senderKind || "").trim();
  if (!from || !viewerId) return false;

  if (senderKind === "profile" || isProfileReplyAuthorId(from)) {
    return isIncomingProfileReplyForAnonVisitor(from, viewerId, firebaseUid, chat, roleInput);
  }

  if (senderKind === "anon" || from.startsWith("anon_")) {
    if (isIncomingAnonMessageForProfileOwner(from, firebaseUid, chat, roleInput)) {
      return true;
    }
  }

  return !isOwnChatSender(from, viewerId, firebaseUid, chat, roleInput);
}

export function isProfileAnonMessageUnreadForViewer(
  message: {
    mine?: boolean;
    readBy?: Record<string, boolean>;
    fromUid?: string;
    senderKind?: string;
  },
  viewerId: string,
  firebaseUid = "",
  chat?: InboxChat,
  roleInput?: ChatViewerRoleInput,
) {
  if (message.mine) return false;
  if (!viewerId) return false;

  const from = String(message.fromUid || "").trim();
  const incoming = isIncomingMessageFromDoc(
    {
      fromUid: from,
      senderKind: message.senderKind,
    },
    viewerId,
    firebaseUid,
    chat,
    roleInput,
  );
  if (!incoming) return false;

  const readBy = message.readBy || {};
  if (readBy[viewerId] === true) return false;

  for (const id of chat
    ? collectViewerSenderIds(chat, viewerId, firebaseUid, roleInput)
    : [viewerId, firebaseUid].filter(Boolean)) {
    if (readBy[id] === true) return false;
  }

  return true;
}
