import { isProfileThreadOwner, profileAuthUid, profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";
import type { User } from "firebase/auth";

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
  | "visitor_identity_not_ready";

export function liveProfileUid(user: User | null | undefined) {
  return profileAuthUid(user);
}

/** Owner role from live viewer identity + chatId slug. Never from mutable targetUid. */
export function resolveLiveOwnerRole(input: {
  chatId: string;
  liveProfileUid: string;
  viewerUsername?: string;
  explicitOwner?: boolean;
}) {
  if (input.explicitOwner === true && input.liveProfileUid) return true;
  return isProfileThreadOwner({
    chatId: input.chatId,
    authUid: input.liveProfileUid,
    viewerUsername: input.viewerUsername,
  });
}

export function buildCanonicalSender(input: {
  authReady: boolean;
  liveProfileUid: string;
  threadAnonId: string;
  chatId: string;
  viewerUsername?: string;
  explicitOwner?: boolean;
}): { ok: true; sender: CanonicalSender } | { ok: false; error: CanonicalSenderError } {
  if (!input.authReady) {
    return { ok: false, error: "auth_not_ready" };
  }

  const liveUid = String(input.liveProfileUid || "").trim();
  const threadAnon = String(input.threadAnonId || "").trim();
  const isOwner = resolveLiveOwnerRole({
    chatId: input.chatId,
    liveProfileUid: liveUid,
    viewerUsername: input.viewerUsername,
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

  if (!threadAnon.startsWith("anon_")) {
    return { ok: false, error: "visitor_identity_not_ready" };
  }

  return {
    ok: true,
    sender: {
      senderAuthUid: liveUid,
      senderProfileId: "",
      senderRole: "anon",
      senderKind: "anon",
      fromUid: threadAnon,
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
  identityReady: boolean;
}): boolean {
  const viewer = String(input.viewerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();

  if (viewer && senderAuth && senderAuth === viewer) return true;
  if (role === "profile") return input.isOwnerViewing === true;
  if (role === "anon") {
    if (!input.identityReady) return false;
    if (input.isOwnerViewing) return false;
    return Boolean(input.threadAnonId && from === input.threadAnonId);
  }
  return false;
}
