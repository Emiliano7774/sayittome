const ANON_TO_MARKER = "__anon_to__";

function safeChatPart(value: string) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 80) || "usuario"
  );
}

function usernameHintFromAnonChatId(chatId: string) {
  const raw = String(chatId || "");
  if (!raw.includes(ANON_TO_MARKER)) return "";
  return raw.split(ANON_TO_MARKER)[1] || "";
}

export function profileReplyAuthorId(targetUid: string) {
  const uid = String(targetUid || "").trim();
  return uid ? `profile_${uid}` : "profile_unknown";
}

export function isProfileReplyAuthorId(from: string) {
  return String(from || "").startsWith("profile_");
}

export function isProfileThreadOwner(input: {
  chatId: string;
  authUid?: string;
  profileUid?: string;
  viewerUsername?: string;
}) {
  const authUid = String(input.authUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  if (authUid && profileUid && authUid === profileUid) return true;

  const hint = usernameHintFromAnonChatId(input.chatId);
  const slug = safeChatPart(input.viewerUsername || "");
  return Boolean(hint && slug && hint === slug);
}

/**
 * Infer owner only when profileUid is empty (cold reopen).
 * Never contradicts a resolved O!=V target.
 */
export function inferOwnerViewingFromAuthors(
  currentUid: string,
  profileUid: string,
  rows: Array<{ fromUid?: string }>,
) {
  const uid = String(currentUid || "").trim();
  const profile = String(profileUid || "").trim();
  if (uid && profile && uid === profile) return true;
  if (!uid) return false;
  if (profile && profile !== uid) return false;
  const mineProfile = profileReplyAuthorId(uid);
  return rows.some((row) => {
    const from = String(row.fromUid || "").trim();
    return from === mineProfile || from === uid;
  });
}

export function visitorAnonMatches(
  from: string,
  threadAnonId: string,
  liveAnonId = "",
  knownAnonIds: string[] = [],
) {
  const author = String(from || "").trim();
  const thread = String(threadAnonId || "").trim();
  const live = String(liveAnonId || "").trim();
  if (thread && author === thread) return true;
  if (live.startsWith("anon_") && author === live) return true;
  return knownAnonIds.some((id) => id === author);
}

export function resolveAnonRoleMine(input: {
  from: string;
  threadAnonId: string;
  liveAnonId?: string;
  knownAnonIds?: string[];
  identityReady: boolean;
  isOwnerViewing: boolean;
}) {
  if (!input.identityReady) return false;
  if (input.isOwnerViewing) return false;
  return visitorAnonMatches(
    input.from,
    input.threadAnonId,
    input.liveAnonId,
    input.knownAnonIds,
  );
}

export function shouldHoldVisualAuthorship(identityReady: boolean) {
  return identityReady !== true;
}

export function isRoleIdentityReady(input: {
  liveProfileUid: string;
  chatId: string;
  viewerUsername?: string;
  profileUid?: string;
  explicitOwner?: boolean;
  threadAnonId?: string;
  authReady?: boolean;
}) {
  if (input.authReady === false) return false;

  const liveUid = String(input.liveProfileUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  const username = String(input.viewerUsername || "").trim();
  const threadAnon = String(input.threadAnonId || "").trim();

  if (input.explicitOwner === true) return Boolean(liveUid);

  if (
    isProfileThreadOwner({
      chatId: input.chatId,
      authUid: liveUid,
      profileUid,
      viewerUsername: username,
    })
  ) {
    return Boolean(liveUid);
  }

  if (!liveUid) {
    // Empty liveUid is never visitor-proof until auth has actually resolved.
    if (input.authReady !== true) return false;
    return threadAnon.startsWith("anon_");
  }
  if (profileUid) {
    if (profileUid === liveUid) return true;
    return threadAnon.startsWith("anon_");
  }
  return false;
}

export type CanonicalSenderRole = "profile" | "anon";

export type CanonicalSender = {
  senderAuthUid: string;
  senderProfileId: string;
  senderRole: CanonicalSenderRole;
  senderKind: CanonicalSenderRole;
  fromUid: string;
};

export type CanonicalSenderError =
  | "auth_not_ready"
  | "owner_identity_not_ready"
  | "visitor_identity_not_ready"
  | "role_identity_not_ready";

export function resolveLiveOwnerRole(input: {
  chatId: string;
  liveProfileUid: string;
  viewerUsername?: string;
  profileUid?: string;
  explicitOwner?: boolean;
}) {
  if (input.explicitOwner === true && input.liveProfileUid) return true;
  return isProfileThreadOwner({
    chatId: input.chatId,
    authUid: input.liveProfileUid,
    profileUid: input.profileUid,
    viewerUsername: input.viewerUsername,
  });
}

export function buildCanonicalSender(input: {
  authReady: boolean;
  liveProfileUid: string;
  threadAnonId: string;
  chatId: string;
  viewerUsername?: string;
  profileUid?: string;
  explicitOwner?: boolean;
  liveAnonId?: string;
}): { ok: true; sender: CanonicalSender } | { ok: false; error: CanonicalSenderError } {
  if (!input.authReady) {
    return { ok: false, error: "auth_not_ready" };
  }

  const liveUid = String(input.liveProfileUid || "").trim();
  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = String(input.liveAnonId || "").trim();
  const visitorFrom =
    liveAnon.startsWith("anon_") ? liveAnon : threadAnon;

  if (
    !isRoleIdentityReady({
      liveProfileUid: liveUid,
      chatId: input.chatId,
      viewerUsername: input.viewerUsername,
      profileUid: input.profileUid,
      explicitOwner: input.explicitOwner,
      threadAnonId: visitorFrom,
      authReady: input.authReady,
    })
  ) {
    return { ok: false, error: "role_identity_not_ready" };
  }

  const isOwner = resolveLiveOwnerRole({
    chatId: input.chatId,
    liveProfileUid: liveUid,
    viewerUsername: input.viewerUsername,
    profileUid: input.profileUid,
    explicitOwner: input.explicitOwner,
  });

  if (isOwner) {
    if (!liveUid) return { ok: false, error: "owner_identity_not_ready" };
    return {
      ok: true,
      sender: {
        senderAuthUid: liveUid,
        senderProfileId: liveUid,
        senderRole: "profile",
        senderKind: "profile",
        fromUid: profileReplyAuthorId(liveUid),
      },
    };
  }

  if (!visitorFrom.startsWith("anon_")) {
    return { ok: false, error: "visitor_identity_not_ready" };
  }

  return {
    ok: true,
    sender: {
      senderAuthUid: liveUid,
      senderProfileId: "",
      senderRole: "anon",
      senderKind: "anon",
      fromUid: visitorFrom,
    },
  };
}

export function buildLegacyCanonicalSender(input: {
  authReady: boolean;
  liveProfileUid: string;
}): { ok: true; sender: CanonicalSender } | { ok: false; error: CanonicalSenderError } {
  if (!input.authReady) return { ok: false, error: "auth_not_ready" };
  const liveUid = String(input.liveProfileUid || "").trim();
  if (!liveUid) return { ok: false, error: "owner_identity_not_ready" };
  return {
    ok: true,
    sender: {
      senderAuthUid: liveUid,
      senderProfileId: liveUid,
      senderRole: "profile",
      senderKind: "profile",
      fromUid: liveUid,
    },
  };
}

export function resolveMineFromCanonicalSender(input: {
  senderAuthUid?: string;
  senderRole?: string;
  fromUid?: string;
  viewerUid: string;
  isOwnerViewing: boolean;
  threadAnonId: string;
  liveAnonId?: string;
  knownAnonIds?: string[];
  identityReady: boolean;
}): boolean {
  const viewer = String(input.viewerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();

  if (viewer && senderAuth && senderAuth === viewer) return true;
  if (role === "profile") return input.isOwnerViewing === true;
  if (role === "anon") {
    return resolveAnonRoleMine({
      from,
      threadAnonId: input.threadAnonId,
      liveAnonId: input.liveAnonId,
      knownAnonIds: input.knownAnonIds,
      identityReady: input.identityReady,
      isOwnerViewing: input.isOwnerViewing,
    });
  }
  return false;
}

export function resolveProfileAnonMessageMine(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  liveAnonId?: string;
  knownAnonIds?: string[];
  profileUid: string;
  messageProfileUid?: string;
  isOwnerViewing: boolean;
  ownerUid?: string;
  senderAuthUid?: string;
  senderRole?: string;
  identityReady?: boolean;
}) {
  const from = String(input.from || "").trim();
  const authUid = String(input.ownerUid || "").trim();
  const senderAuthUid = String(input.senderAuthUid || "").trim();
  const senderRole = String(input.senderRole || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  const messageProfileUid = String(input.messageProfileUid || "").trim();

  if (authUid && senderAuthUid && senderAuthUid === authUid) return true;

  const identityReady =
    input.identityReady !== undefined
      ? input.identityReady
      : Boolean(authUid || input.isOwnerViewing === true);

  if (senderRole === "profile") return input.isOwnerViewing === true;
  if (senderRole === "anon") {
    return resolveAnonRoleMine({
      from,
      threadAnonId: input.threadAnonId,
      liveAnonId: input.liveAnonId,
      knownAnonIds: input.knownAnonIds,
      identityReady,
      isOwnerViewing: input.isOwnerViewing,
    });
  }

  const ownsProfileShape =
    Boolean(authUid) &&
    (from === authUid ||
      from === profileReplyAuthorId(authUid) ||
      messageProfileUid === authUid);

  if (ownsProfileShape) return true;

  if (input.isOwnerViewing === true) {
    return (
      senderRole === "profile" ||
      isProfileReplyAuthorId(from) ||
      from === authUid
    );
  }

  if (senderRole === "profile" || isProfileReplyAuthorId(from)) {
    return false;
  }

  if (!identityReady) return false;

  return visitorAnonMatches(
    from,
    input.threadAnonId,
    input.liveAnonId,
    input.knownAnonIds,
  );
}
