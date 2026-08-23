export const ISSUE_VERIFIED_PROFILE_LINK_TICKET = "issueVerifiedProfileLinkTicket";
export const CLAIM_VERIFIED_PROFILE_LINK = "claimVerifiedProfileLink";
/** Durable across WebView process death (Android). Legacy session key migrated once. */
const STORAGE_KEY = "sayittome:verified-profile-link-ticket";

export type PendingVerifiedProfileLinkTicket = {
  ticketId: string;
  ownerUid: string;
  username: string;
  text: string;
  expiresAtMs: number;
  /** Bound after first persist; retries must reuse this message only. */
  boundChatId?: string;
  boundMessageId?: string;
};

export type VerifiedProfileLinkClaimStage =
  | "peek"
  | "bind"
  | "call"
  | "ack"
  | "mismatch"
  | "expired"
  | "account"
  | "other-message"
  | "transient";

export type VerifiedProfileLinkClaimResult =
  | {
      ok: true;
      ticketId: string;
      chatId: string;
      messageId: string;
      stage: "ack";
    }
  | {
      ok: false;
      stage: VerifiedProfileLinkClaimStage;
      error: string;
      retryable: boolean;
    };

function asId(value: unknown) {
  return String(value || "").trim();
}

function parseStoredTicket(raw: string | null): PendingVerifiedProfileLinkTicket | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingVerifiedProfileLinkTicket;
    if (!parsed?.ticketId || !parsed.ownerUid || !parsed.text || !parsed.expiresAtMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function scrubLegacySessionTicket() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** One-shot migrate: sessionStorage → durable localStorage, then delete session key. */
function migrateSessionTicketToLocal(): PendingVerifiedProfileLinkTicket | null {
  if (typeof window === "undefined") return null;
  let legacy: PendingVerifiedProfileLinkTicket | null = null;
  try {
    legacy = parseStoredTicket(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    legacy = null;
  }
  scrubLegacySessionTicket();
  if (!legacy) return null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  } catch {
    // quota — still return for this read; next successful write persists
  }
  return legacy;
}

function readStorage(): PendingVerifiedProfileLinkTicket | null {
  if (typeof window === "undefined") return null;
  try {
    const localRaw = window.localStorage.getItem(STORAGE_KEY);
    const local = parseStoredTicket(localRaw);
    if (localRaw && !local) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    if (local) {
      scrubLegacySessionTicket();
      return local;
    }
    return migrateSessionTicketToLocal();
  } catch {
    return migrateSessionTicketToLocal();
  }
}

function writeStorage(ticket: PendingVerifiedProfileLinkTicket | null) {
  if (typeof window === "undefined") return;
  try {
    // Never leave a resurrectable session copy after durable write/clear.
    scrubLegacySessionTicket();
    if (!ticket) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
  } catch {
    // quota
  }
}

export function clearVerifiedProfileLinkTicket() {
  writeStorage(null);
}

/**
 * Clear only if storage still matches this exact claim attempt.
 * Never wipe a newer/different ticket that replaced state during await.
 */
export function clearVerifiedProfileLinkTicketIfExact(match: {
  ticketId: string;
  boundChatId: string;
  boundMessageId: string;
}): boolean {
  const pending = readStorage();
  if (!pending) return false;
  if (
    asId(pending.ticketId) !== asId(match.ticketId) ||
    asId(pending.boundChatId) !== asId(match.boundChatId) ||
    asId(pending.boundMessageId) !== asId(match.boundMessageId)
  ) {
    return false;
  }
  writeStorage(null);
  return true;
}

/**
 * Persist ticket. Refuses to replace a different already-bound ticket
 * (would abandon an in-flight claim). Same ticketId may update (bind).
 * Unbound tickets may be replaced.
 */
export function storeVerifiedProfileLinkTicket(
  ticket: PendingVerifiedProfileLinkTicket,
): boolean {
  const current = readStorage();
  if (current) {
    const sameTicket = asId(current.ticketId) === asId(ticket.ticketId);
    const currentBound = Boolean(
      asId(current.boundChatId) && asId(current.boundMessageId),
    );
    if (currentBound && !sameTicket) {
      return false;
    }
  }
  writeStorage({
    ticketId: asId(ticket.ticketId),
    ownerUid: asId(ticket.ownerUid),
    username: asId(ticket.username).replace(/^@/, "").toLowerCase(),
    text: asId(ticket.text),
    expiresAtMs: Number(ticket.expiresAtMs) || 0,
    ...(ticket.boundChatId ? { boundChatId: asId(ticket.boundChatId) } : {}),
    ...(ticket.boundMessageId ? { boundMessageId: asId(ticket.boundMessageId) } : {}),
  });
  return true;
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

/**
 * One-shot clear on account/text mismatch or expiry. Does not clear on peek-only.
 * Prefer reserve + claim for send paths (ticket survives transient claim failures).
 */
export function consumeVerifiedProfileLinkTicket(input: {
  ownerUid: string;
  text: string;
  nowMs?: number;
}): PendingVerifiedProfileLinkTicket | null {
  const pending = readStorage();
  if (!pending) return null;
  if (asId(pending.ownerUid) !== asId(input.ownerUid)) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  if (pending.expiresAtMs <= (input.nowMs ?? Date.now())) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  if (asId(input.text) !== pending.text) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  clearVerifiedProfileLinkTicket();
  return pending;
}

/** Keep ticket durable; clear only on mismatch / other account / expiry. */
export function reserveVerifiedProfileLinkTicket(input: {
  ownerUid: string;
  text: string;
  nowMs?: number;
}): PendingVerifiedProfileLinkTicket | null {
  const pending = readStorage();
  if (!pending) return null;
  if (asId(pending.ownerUid) !== asId(input.ownerUid)) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  if (pending.expiresAtMs <= (input.nowMs ?? Date.now())) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  if (asId(input.text) !== pending.text) {
    clearVerifiedProfileLinkTicket();
    return null;
  }
  return pending;
}

export function bindVerifiedProfileLinkTicket(input: {
  ownerUid: string;
  chatId: string;
  messageId: string;
}): PendingVerifiedProfileLinkTicket | null {
  const pending = peekVerifiedProfileLinkTicket(input.ownerUid);
  if (!pending) return null;
  const chatId = asId(input.chatId);
  const messageId = asId(input.messageId);
  if (!chatId || !messageId) return null;

  if (pending.boundChatId && pending.boundMessageId) {
    if (
      asId(pending.boundChatId) !== chatId ||
      asId(pending.boundMessageId) !== messageId
    ) {
      return null;
    }
    return pending;
  }

  const bound: PendingVerifiedProfileLinkTicket = {
    ...pending,
    boundChatId: chatId,
    boundMessageId: messageId,
  };
  if (!storeVerifiedProfileLinkTicket(bound)) return null;
  return bound;
}

export function isBoundPendingVerifiedProfileLinkTicket(
  ticket: PendingVerifiedProfileLinkTicket | null | undefined,
): boolean {
  return Boolean(asId(ticket?.boundChatId) && asId(ticket?.boundMessageId));
}

export type IssueVerifiedProfileLinkTicketResult =
  | { ok: true; ticket: PendingVerifiedProfileLinkTicket }
  | { ok: false; reason: "claim_pending" }
  | { ok: false; reason: "issue_failed" };

/**
 * Issue a fresh ticket for copy. A bound pending ticket is never returned as
 * newly issued/copyable — callers must surface claim_pending instead.
 */
export async function issueVerifiedProfileLinkTicket(input: {
  username: string;
  ownerUid: string;
  /** When false, never overwrite an unexpired reserved ticket (native modal). */
  overwrite?: boolean;
  callIssue?: (username: string) => Promise<{
    ticketId: string;
    text: string;
    expiresAtMs: number;
  }>;
}): Promise<IssueVerifiedProfileLinkTicketResult> {
  const ownerUid = asId(input.ownerUid);
  const username = asId(input.username);
  if (!ownerUid || ownerUid.startsWith("anon_") || !username) {
    return { ok: false, reason: "issue_failed" };
  }

  const existingBefore = peekVerifiedProfileLinkTicket(ownerUid);
  if (isBoundPendingVerifiedProfileLinkTicket(existingBefore)) {
    // Bound owns an in-flight claim — not copyable as a "new" verified link.
    return { ok: false, reason: "claim_pending" };
  }
  if (input.overwrite === false && existingBefore) {
    return { ok: true, ticket: existingBefore };
  }

  try {
    let issued: { ticketId: string; text: string; expiresAtMs: number };
    if (input.callIssue) {
      issued = await input.callIssue(username);
    } else {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/lib/firebase");
      issued = (
        await httpsCallable<
          { username: string },
          { ticketId: string; text: string; expiresAtMs: number }
        >(
          functions,
          ISSUE_VERIFIED_PROFILE_LINK_TICKET,
        )({ username })
      ).data;
    }
    if (!issued?.ticketId || issued.ticketId.length < 32 || !issued.text || !issued.expiresAtMs) {
      return { ok: false, reason: "issue_failed" };
    }

    // Re-check after await: if a bind appeared, discard this issuance (fail-closed).
    const existingAfter = peekVerifiedProfileLinkTicket(ownerUid);
    if (isBoundPendingVerifiedProfileLinkTicket(existingAfter)) {
      return { ok: false, reason: "claim_pending" };
    }
    if (input.overwrite === false && existingAfter) {
      return { ok: true, ticket: existingAfter };
    }

    const ticket: PendingVerifiedProfileLinkTicket = {
      ticketId: issued.ticketId,
      ownerUid,
      username: username.replace(/^@/, "").toLowerCase(),
      text: issued.text,
      expiresAtMs: issued.expiresAtMs,
    };
    if (!storeVerifiedProfileLinkTicket(ticket)) {
      // Store refused — typically a bound ticket won the race.
      if (isBoundPendingVerifiedProfileLinkTicket(peekVerifiedProfileLinkTicket(ownerUid))) {
        return { ok: false, reason: "claim_pending" };
      }
      return { ok: false, reason: "issue_failed" };
    }
    return { ok: true, ticket };
  } catch {
    return { ok: false, reason: "issue_failed" };
  }
}

function logClaimStage(stage: VerifiedProfileLinkClaimStage, extra?: Record<string, string>) {
  try {
    console.info("[verified-profile-link-claim]", {
      stage,
      ...extra,
    });
  } catch {
    // ignore
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
}): Promise<VerifiedProfileLinkClaimResult> {
  const chatId = asId(input.chatId);
  const messageId = asId(input.messageId);
  const ownerUid = asId(input.ownerUid);

  const reserved = reserveVerifiedProfileLinkTicket({
    ownerUid,
    text: input.text,
  });
  if (!reserved) {
    logClaimStage("peek");
    return { ok: false, stage: "peek", error: "no_ticket", retryable: false };
  }

  if (reserved.boundChatId && reserved.boundMessageId) {
    if (
      asId(reserved.boundChatId) !== chatId ||
      asId(reserved.boundMessageId) !== messageId
    ) {
      logClaimStage("other-message", { ticketPrefix: reserved.ticketId.slice(0, 8) });
      return {
        ok: false,
        stage: "other-message",
        error: "bound_other_message",
        retryable: false,
      };
    }
  }

  const bound = bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId });
  if (!bound) {
    logClaimStage("bind", { ticketPrefix: reserved.ticketId.slice(0, 8) });
    return { ok: false, stage: "bind", error: "bind_failed", retryable: false };
  }

  const exact = {
    ticketId: bound.ticketId,
    boundChatId: chatId,
    boundMessageId: messageId,
  };

  try {
    logClaimStage("call", { ticketPrefix: bound.ticketId.slice(0, 8) });
    if (input.callClaim) {
      await input.callClaim({
        ticketId: bound.ticketId,
        chatId,
        messageId,
      });
    } else {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/lib/firebase");
      await httpsCallable(
        functions,
        CLAIM_VERIFIED_PROFILE_LINK,
      )({
        ticketId: bound.ticketId,
        chatId,
        messageId,
      });
    }
    clearVerifiedProfileLinkTicketIfExact(exact);
    logClaimStage("ack", { ticketPrefix: bound.ticketId.slice(0, 8) });
    return {
      ok: true,
      ticketId: bound.ticketId,
      chatId,
      messageId,
      stage: "ack",
    };
  } catch (error) {
    const code = String(
      (error as { code?: string; message?: string })?.code ||
        (error as { message?: string })?.message ||
        "transient",
    );
    // not-found stays retryable: claim can race the just-written message or an
    // alias chatId; clearing the ticket would permanently lose the attestation.
    const permanent =
      /permission-denied|invalid-argument|failed-precondition|unauthenticated/i.test(
        code,
      );
    if (permanent) {
      clearVerifiedProfileLinkTicketIfExact(exact);
      logClaimStage("mismatch", { ticketPrefix: bound.ticketId.slice(0, 8) });
      return { ok: false, stage: "mismatch", error: code, retryable: false };
    }
    logClaimStage("transient", { ticketPrefix: bound.ticketId.slice(0, 8) });
    return { ok: false, stage: "transient", error: code, retryable: true };
  }
}
