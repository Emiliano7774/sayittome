import { createHmac, timingSafeEqual } from "crypto";

export const VERIFIED_PROFILE_LINK_TICKET_TTL_MS = 15 * 60 * 1000;
export const VERIFIED_PROFILE_LINK_TICKET_COLLECTION = "verifiedProfileLinkTickets";
export const VERIFIED_PROFILE_PUBLIC_HOST = "sytm.me";
export const VERIFIED_PROFILE_LINK_MAC_SECRET_NAME = "VERIFIED_PROFILE_LINK_MAC";

export type VerifiedProfileAttestationHint = {
  ticketId: string;
  chatId?: string;
  messageId?: string;
};

export type VerifiedProfileLinkTicket = {
  ticketId?: string;
  ownerUid: string;
  username: string;
  text: string;
  expiresAtMs: number;
  consumed: boolean;
  consumedChatId?: string;
  consumedMessageId?: string;
  mac?: string;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export function normalizeVerifiedProfileUsername(username: string) {
  let clean = asId(username).toLowerCase();
  if (clean.startsWith("@")) clean = clean.slice(1);
  return clean;
}

export function isVerifiedProfileUsername(username: string) {
  return /^[a-z0-9._-]{3,24}$/.test(username);
}

export function canonicalVerifiedProfileLinkText(username: string) {
  const slug = normalizeVerifiedProfileUsername(username);
  return `https://${VERIFIED_PROFILE_PUBLIC_HOST}/@${slug}`;
}

export function readVerifiedProfileLinkSecret(secret: string | undefined | null) {
  const value = String(secret || "").trim();
  if (value.length < 16) {
    return { ok: false as const, error: "failed-precondition" as const };
  }
  return { ok: true as const, secret: value };
}

export function ticketMacPayload(input: {
  ticketId: string;
  ownerUid: string;
  username: string;
  text: string;
  expiresAtMs: number;
  consumed: boolean;
  consumedChatId?: string;
  consumedMessageId?: string;
}) {
  return [
    asId(input.ticketId),
    asId(input.ownerUid),
    normalizeVerifiedProfileUsername(input.username),
    asId(input.text),
    String(Number(input.expiresAtMs) || 0),
    input.consumed ? "1" : "0",
    asId(input.consumedChatId),
    asId(input.consumedMessageId),
  ].join("\n");
}

export function signVerifiedProfileLinkTicket(
  secret: string,
  ticket: {
    ticketId: string;
    ownerUid: string;
    username: string;
    text: string;
    expiresAtMs: number;
    consumed: boolean;
    consumedChatId?: string;
    consumedMessageId?: string;
  },
) {
  const ready = readVerifiedProfileLinkSecret(secret);
  if (!ready.ok) return { ok: false as const, error: ready.error };
  return {
    ok: true as const,
    mac: createHmac("sha256", ready.secret).update(ticketMacPayload(ticket)).digest("hex"),
  };
}

export function ticketHasValidMac(
  secret: string,
  ticket: VerifiedProfileLinkTicket & { ticketId: string },
) {
  const signed = signVerifiedProfileLinkTicket(secret, {
    ticketId: ticket.ticketId,
    ownerUid: ticket.ownerUid,
    username: ticket.username,
    text: ticket.text,
    expiresAtMs: ticket.expiresAtMs,
    consumed: ticket.consumed,
    consumedChatId: ticket.consumedChatId,
    consumedMessageId: ticket.consumedMessageId,
  });
  if (!signed.ok) return false;
  const actual = asId(ticket.mac);
  if (!actual || actual.length !== signed.mac.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(signed.mac, "hex"));
  } catch {
    return false;
  }
}

/** Shape-only hint. Never grants a badge. */
export function readAttestationHint(raw: unknown): VerifiedProfileAttestationHint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ticketId = asId((raw as { ticketId?: unknown }).ticketId);
  if (!ticketId || ticketId.length < 32) return null;
  return {
    ticketId,
    chatId: asId((raw as { chatId?: unknown }).chatId) || undefined,
    messageId: asId((raw as { messageId?: unknown }).messageId) || undefined,
  };
}

export function decideIssueVerifiedProfileLinkTicket(input: {
  uid: string;
  username: string;
  profileUsername: string;
  nowMs: number;
  secret: string;
}):
  | { ok: true; ownerUid: string; username: string; text: string; expiresAtMs: number }
  | { ok: false; error: "unauthenticated" | "permission-denied" | "invalid-argument" | "failed-precondition" } {
  const secret = readVerifiedProfileLinkSecret(input.secret);
  if (!secret.ok) return secret;

  const uid = asId(input.uid);
  if (!uid || uid.startsWith("anon_")) return { ok: false, error: "unauthenticated" };

  const username = normalizeVerifiedProfileUsername(input.username);
  const profileUsername = normalizeVerifiedProfileUsername(input.profileUsername);
  if (!isVerifiedProfileUsername(username) || !isVerifiedProfileUsername(profileUsername)) {
    return { ok: false, error: "invalid-argument" };
  }
  if (username !== profileUsername) return { ok: false, error: "permission-denied" };

  return {
    ok: true,
    ownerUid: uid,
    username,
    text: canonicalVerifiedProfileLinkText(username),
    expiresAtMs: input.nowMs + VERIFIED_PROFILE_LINK_TICKET_TTL_MS,
  };
}

export function decideClaimVerifiedProfileLinkTicket(input: {
  uid: string;
  secret: string;
  ticket: (VerifiedProfileLinkTicket & { ticketId: string }) | null;
  messageText: string;
  messageAuthorUid: string;
  chatId: string;
  messageId: string;
  nowMs: number;
}):
  | { ok: true; username: string; alreadyClaimed?: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "permission-denied"
        | "not-found"
        | "failed-precondition"
        | "invalid-argument";
      reason?: "expired" | "other-chat" | "other-message" | "text-mismatch" | "not-owner" | "bad-mac" | "no-secret";
    } {
  if (!readVerifiedProfileLinkSecret(input.secret).ok) {
    return { ok: false, error: "failed-precondition", reason: "no-secret" };
  }
  const uid = asId(input.uid);
  if (!uid || uid.startsWith("anon_")) return { ok: false, error: "unauthenticated" };

  const chatId = asId(input.chatId);
  const messageId = asId(input.messageId);
  if (!chatId || !messageId) return { ok: false, error: "invalid-argument" };
  if (!input.ticket) return { ok: false, error: "not-found" };
  if (!ticketHasValidMac(input.secret, input.ticket)) {
    return { ok: false, error: "permission-denied", reason: "bad-mac" };
  }

  if (asId(input.ticket.ownerUid) !== uid) {
    return { ok: false, error: "permission-denied", reason: "not-owner" };
  }
  const username = normalizeVerifiedProfileUsername(input.ticket.username);
  const expected = canonicalVerifiedProfileLinkText(username);
  if (asId(input.messageText) !== expected || asId(input.ticket.text) !== expected) {
    return { ok: false, error: "invalid-argument", reason: "text-mismatch" };
  }

  const author = asId(input.messageAuthorUid);
  if (author !== uid && author !== `profile_${uid}`) {
    return { ok: false, error: "permission-denied", reason: "not-owner" };
  }

  if (input.ticket.consumed) {
    const sameChat = asId(input.ticket.consumedChatId) === chatId;
    const sameMessage = asId(input.ticket.consumedMessageId) === messageId;
    if (!sameChat) return { ok: false, error: "failed-precondition", reason: "other-chat" };
    if (!sameMessage) return { ok: false, error: "failed-precondition", reason: "other-message" };
    // Lost ACK / client retry: same ticket+chat+message is idempotent success.
    return { ok: true, username, alreadyClaimed: true as const };
  }
  if (input.ticket.expiresAtMs <= input.nowMs) {
    return { ok: false, error: "failed-precondition", reason: "expired" };
  }

  return { ok: true, username };
}

export function decideVerifyVerifiedProfileLink(input: {
  secret: string;
  ticket: (VerifiedProfileLinkTicket & { ticketId: string }) | null;
  messageText: string;
  messageAuthorUid: string;
  chatId: string;
  messageId: string;
  deletedForEveryone?: boolean;
}):
  | { ok: true; username: string }
  | {
      ok: false;
      error: "failed-precondition" | "not-found" | "permission-denied" | "invalid-argument";
      reason?: "no-secret" | "bad-mac" | "unclaimed" | "other-chat" | "other-message" | "text-mismatch" | "not-owner" | "deleted";
    } {
  if (!readVerifiedProfileLinkSecret(input.secret).ok) {
    return { ok: false, error: "failed-precondition", reason: "no-secret" };
  }
  if (input.deletedForEveryone) {
    return { ok: false, error: "invalid-argument", reason: "deleted" };
  }
  if (!input.ticket) return { ok: false, error: "not-found" };
  if (!ticketHasValidMac(input.secret, input.ticket)) {
    return { ok: false, error: "permission-denied", reason: "bad-mac" };
  }
  if (!input.ticket.consumed) {
    return { ok: false, error: "failed-precondition", reason: "unclaimed" };
  }

  const chatId = asId(input.chatId);
  const messageId = asId(input.messageId);
  if (asId(input.ticket.consumedChatId) !== chatId) {
    return { ok: false, error: "failed-precondition", reason: "other-chat" };
  }
  if (asId(input.ticket.consumedMessageId) !== messageId) {
    return { ok: false, error: "failed-precondition", reason: "other-message" };
  }

  const username = normalizeVerifiedProfileUsername(input.ticket.username);
  const expected = canonicalVerifiedProfileLinkText(username);
  if (asId(input.messageText) !== expected || asId(input.ticket.text) !== expected) {
    return { ok: false, error: "invalid-argument", reason: "text-mismatch" };
  }

  const ownerUid = asId(input.ticket.ownerUid);
  const author = asId(input.messageAuthorUid);
  if (author !== ownerUid && author !== `profile_${ownerUid}`) {
    return { ok: false, error: "permission-denied", reason: "not-owner" };
  }

  return { ok: true, username };
}

export function decideKeepVerifiedProfileAttestation(input: {
  attestation: unknown;
  secret: string;
  ticket: (VerifiedProfileLinkTicket & { ticketId: string }) | null;
  chatId: string;
  messageId: string;
  messageText: string;
  messageAuthorUid: string;
}): "keep" | "strip" {
  const hint = readAttestationHint(input.attestation);
  if (!hint) return input.attestation == null ? "keep" : "strip";
  const verified = decideVerifyVerifiedProfileLink({
    secret: input.secret,
    ticket: input.ticket,
    messageText: input.messageText,
    messageAuthorUid: input.messageAuthorUid,
    chatId: input.chatId,
    messageId: input.messageId,
  });
  return verified.ok ? "keep" : "strip";
}
