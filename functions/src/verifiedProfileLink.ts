/**
 * Verified profile-link tickets.
 *
 * Origin proof is a server MAC (HMAC-SHA256) over ticket fields using
 * Firebase Secret `VERIFIED_PROFILE_LINK_MAC`. The secret never leaves
 * Functions. Missing/short secret fails closed: no issue/claim/verify/badge.
 *
 * Deploy (once per project, then functions):
 *   firebase functions:secrets:set VERIFIED_PROFILE_LINK_MAC
 *   firebase deploy --only functions
 * There is no public/dev fallback.
 */
import { randomBytes } from "crypto";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { resolveChatMessageLocation } from "./deleteChatMessage";
import {
  VERIFIED_PROFILE_LINK_TICKET_COLLECTION,
  decideClaimVerifiedProfileLinkTicket,
  decideIssueVerifiedProfileLinkTicket,
  decideKeepVerifiedProfileAttestation,
  decideVerifyVerifiedProfileLink,
  readAttestationHint,
  signVerifiedProfileLinkTicket,
  type VerifiedProfileLinkTicket,
} from "./verifiedProfileLinkCore";

function asId(value: unknown) {
  return String(value || "").trim();
}

function profileUsernameFromUser(data: Record<string, unknown> | undefined) {
  return asId(data?.usernameLower || data?.username || data?.nombre);
}

function ticketFromDoc(
  ticketId: string,
  data: Record<string, unknown> | undefined,
): (VerifiedProfileLinkTicket & { ticketId: string }) | null {
  if (!data) return null;
  return {
    ticketId,
    ownerUid: asId(data.ownerUid),
    username: asId(data.username),
    text: asId(data.text),
    expiresAtMs: Number(data.expiresAtMs) || 0,
    consumed: data.consumed === true,
    consumedChatId: asId(data.consumedChatId) || undefined,
    consumedMessageId: asId(data.consumedMessageId) || undefined,
    mac: asId(data.mac) || undefined,
  };
}

function messageAuthorUid(message: Record<string, unknown>) {
  return asId(
    message.senderAuthUid ||
      message.createdByAuthUid ||
      message.profileUid ||
      message.senderProfileId ||
      message.fromUid,
  );
}

function throwHttps(
  error: "unauthenticated" | "permission-denied" | "not-found" | "failed-precondition" | "invalid-argument",
  message?: string,
): never {
  throw new HttpsError(error, message || error);
}

export async function handleIssueVerifiedProfileLinkTicket(
  request: Pick<CallableRequest, "auth" | "data">,
  db: Firestore,
  secret: string,
) {
  const uid = asId(request.auth?.uid);
  const username = asId(request.data?.username);
  const userSnap = uid ? await db.collection("usuarios").doc(uid).get() : null;
  const decision = decideIssueVerifiedProfileLinkTicket({
    uid,
    username,
    profileUsername: profileUsernameFromUser(userSnap?.data()),
    nowMs: Date.now(),
    secret,
  });
  if (!decision.ok) throwHttps(decision.error);

  const ticketId = randomBytes(24).toString("hex");
  const signed = signVerifiedProfileLinkTicket(secret, {
    ticketId,
    ownerUid: decision.ownerUid,
    username: decision.username,
    text: decision.text,
    expiresAtMs: decision.expiresAtMs,
    consumed: false,
  });
  if (!signed.ok) throwHttps(signed.error);

  await db.collection(VERIFIED_PROFILE_LINK_TICKET_COLLECTION).doc(ticketId).set({
    ownerUid: decision.ownerUid,
    username: decision.username,
    text: decision.text,
    expiresAtMs: decision.expiresAtMs,
    consumed: false,
    mac: signed.mac,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true as const,
    ticketId,
    text: decision.text,
    expiresAtMs: decision.expiresAtMs,
  };
}

export async function handleClaimVerifiedProfileLink(
  request: Pick<CallableRequest, "auth" | "data">,
  db: Firestore,
  secret: string,
) {
  const uid = asId(request.auth?.uid);
  const ticketId = asId(request.data?.ticketId);
  const chatId = asId(request.data?.chatId);
  const messageId = asId(request.data?.messageId);
  if (!ticketId || !chatId || !messageId) {
    throwHttps("invalid-argument", "Invalid claim payload");
  }

  await db.runTransaction(async (tx) => {
    const ticketRef = db.collection(VERIFIED_PROFILE_LINK_TICKET_COLLECTION).doc(ticketId);
    const ticketSnap = await tx.get(ticketRef);
    const located = await resolveChatMessageLocation(tx, db, chatId, messageId);
    if ("error" in located) {
      throwHttps("not-found", located.target === "message" ? "Message not found" : "Chat not found");
    }

    const message = located.message as Record<string, unknown>;
    const ticket = ticketFromDoc(ticketId, ticketSnap.data());
    const decision = decideClaimVerifiedProfileLinkTicket({
      uid,
      secret,
      ticket,
      messageText: asId(message.texto || message.text),
      messageAuthorUid: messageAuthorUid(message),
      chatId,
      messageId,
      nowMs: Date.now(),
    });
    if (!decision.ok) throwHttps(decision.error, decision.reason || decision.error);

    const resigned = signVerifiedProfileLinkTicket(secret, {
      ticketId,
      ownerUid: asId(ticket?.ownerUid),
      username: decision.username,
      text: asId(ticket?.text),
      expiresAtMs: Number(ticket?.expiresAtMs) || 0,
      consumed: true,
      consumedChatId: chatId,
      consumedMessageId: messageId,
    });
    if (!resigned.ok) throwHttps(resigned.error);

    tx.update(ticketRef, {
      consumed: true,
      consumedChatId: chatId,
      consumedMessageId: messageId,
      consumedAt: FieldValue.serverTimestamp(),
      mac: resigned.mac,
    });
    tx.update(located.chatRef.collection(located.messageSubcollection).doc(messageId), {
      verifiedProfileAttestation: {
        ticketId,
        chatId,
        messageId,
      },
    });
  });

  return { ok: true as const, ticketId };
}

export async function handleVerifyVerifiedProfileLink(
  request: Pick<CallableRequest, "auth" | "data">,
  db: Firestore,
  secret: string,
) {
  const chatId = asId(request.data?.chatId);
  const messageId = asId(request.data?.messageId);
  const ticketId = asId(request.data?.ticketId);
  if (!chatId || !messageId || !ticketId) {
    throwHttps("invalid-argument", "Invalid verify payload");
  }

  const located = await resolveChatMessageLocation(
    { get: (ref) => db.doc(ref.path).get() },
    db,
    chatId,
    messageId,
  );
  if ("error" in located) {
    return { ok: false as const };
  }

  const message = located.message as Record<string, unknown>;
  const ticketSnap = await db.collection(VERIFIED_PROFILE_LINK_TICKET_COLLECTION).doc(ticketId).get();
  const decision = decideVerifyVerifiedProfileLink({
    secret,
    ticket: ticketFromDoc(ticketId, ticketSnap.data()),
    messageText: asId(message.texto || message.text),
    messageAuthorUid: messageAuthorUid(message),
    chatId,
    messageId,
    deletedForEveryone: message.deletedForEveryone === true,
  });
  if (!decision.ok) return { ok: false as const };
  return { ok: true as const, username: decision.username };
}

export async function handleScrubVerifiedProfileAttestation(input: {
  db: Firestore;
  secret: string;
  chatId: string;
  messageId: string;
  attestation: unknown;
  messageText: string;
  messageAuthorUid: string;
  messageRef: { update: (data: Record<string, unknown>) => Promise<unknown> };
}) {
  const hint = readAttestationHint(input.attestation);
  const ticketSnap = hint
    ? await input.db.collection(VERIFIED_PROFILE_LINK_TICKET_COLLECTION).doc(hint.ticketId).get()
    : null;
  const keep = decideKeepVerifiedProfileAttestation({
    attestation: input.attestation,
    secret: input.secret,
    ticket: hint ? ticketFromDoc(hint.ticketId, ticketSnap?.data()) : null,
    chatId: input.chatId,
    messageId: input.messageId,
    messageText: input.messageText,
    messageAuthorUid: input.messageAuthorUid,
  });
  if (keep === "strip") {
    await input.messageRef.update({
      verifiedProfileAttestation: FieldValue.delete(),
    });
    return { stripped: true as const };
  }
  return { stripped: false as const };
}
