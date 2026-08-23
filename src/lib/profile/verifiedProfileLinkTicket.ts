import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export const ISSUE_VERIFIED_PROFILE_LINK_TICKET = "issueVerifiedProfileLinkTicket";
export const CLAIM_VERIFIED_PROFILE_LINK = "claimVerifiedProfileLink";
const STORAGE_KEY = "sayittome:verified-profile-link-ticket";

export type PendingVerifiedProfileLinkTicket = {
  ticketId: string;
  ownerUid: string;
  username: string;
  text: string;
  expiresAtMs: number;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

function readStorage(): PendingVerifiedProfileLinkTicket | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerifiedProfileLinkTicket;
    if (!parsed?.ticketId || !parsed.ownerUid || !parsed.text || !parsed.expiresAtMs) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(ticket: PendingVerifiedProfileLinkTicket | null) {
  if (typeof window === "undefined") return;
  try {
    if (!ticket) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
  } catch {
    // quota
  }
}

export function clearVerifiedProfileLinkTicket() {
  writeStorage(null);
}

export function storeVerifiedProfileLinkTicket(ticket: PendingVerifiedProfileLinkTicket) {
  writeStorage(ticket);
}

export function peekVerifiedProfileLinkTicket(ownerUid: string, nowMs = Date.now()) {
  const pending = readStorage();
  if (!pending) return null;
  if (asId(pending.ownerUid) !== asId(ownerUid)) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  if (pending.expiresAtMs <= nowMs) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  return pending;
}

/** One-shot: first send / mismatch / other account / expiry always clears. */
export function consumeVerifiedProfileLinkTicket(input: {
  ownerUid: string;
  text: string;
  nowMs?: number;
}): PendingVerifiedProfileLinkTicket | null {
  const pending = readStorage();
  clearVerifiedProfileLinkTicket();
  if (!pending) return null;
  if (asId(pending.ownerUid) !== asId(input.ownerUid)) return null;
  if (pending.expiresAtMs <= (input.nowMs ?? Date.now())) return null;
  if (asId(input.text) !== pending.text) return null;
  return pending;
}

export async function issueVerifiedProfileLinkTicket(input: {
  username: string;
  ownerUid: string;
  callIssue?: (username: string) => Promise<{
    ticketId: string;
    text: string;
    expiresAtMs: number;
  }>;
}): Promise<PendingVerifiedProfileLinkTicket | null> {
  const ownerUid = asId(input.ownerUid);
  const username = asId(input.username);
  if (!ownerUid || ownerUid.startsWith("anon_") || !username) return null;

  try {
    const issued = input.callIssue
      ? await input.callIssue(username)
      : (
          await httpsCallable<
            { username: string },
            { ticketId: string; text: string; expiresAtMs: number }
          >(
            functions,
            ISSUE_VERIFIED_PROFILE_LINK_TICKET,
          )({ username })
        ).data;
    if (!issued?.ticketId || issued.ticketId.length < 32 || !issued.text || !issued.expiresAtMs) {
      return null;
    }
    const ticket: PendingVerifiedProfileLinkTicket = {
      ticketId: issued.ticketId,
      ownerUid,
      username: username.replace(/^@/, "").toLowerCase(),
      text: issued.text,
      expiresAtMs: issued.expiresAtMs,
    };
    storeVerifiedProfileLinkTicket(ticket);
    return ticket;
  } catch {
    return null;
  }
}

export async function maybeClaimVerifiedProfileLink(input: {
  chatId: string;
  messageId: string;
  text: string;
  ownerUid: string;
  callClaim?: (payload: {
    ticketId: string;
    chatId: string;
    messageId: string;
  }) => Promise<unknown>;
}): Promise<boolean> {
  const ticket = consumeVerifiedProfileLinkTicket({
    ownerUid: input.ownerUid,
    text: input.text,
  });
  if (!ticket) return false;

  try {
    if (input.callClaim) {
      await input.callClaim({
        ticketId: ticket.ticketId,
        chatId: input.chatId,
        messageId: input.messageId,
      });
    } else {
      await httpsCallable(
        functions,
        CLAIM_VERIFIED_PROFILE_LINK,
      )({
        ticketId: ticket.ticketId,
        chatId: input.chatId,
        messageId: input.messageId,
      });
    }
    return true;
  } catch {
    return false;
  }
}
