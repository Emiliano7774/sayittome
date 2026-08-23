/**
 * CHAT_OFFICIAL_PROFILE_LINK_TICKET_RACE
 * Old ACK must not clear a newer ticket; second copy must not abandon a bound claim.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const ticket = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts")).href
);

const OFFICIAL = "https://sytm.me/@sex";
const ownerUid = "uid_owner";
const chatId = "chat_race";
const messageId = "msg_old";
const ticketOld = "a".repeat(40);
const ticketNew = "b".repeat(40);

const src = fs.readFileSync(
  path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"),
  "utf8",
);
assert.match(src, /clearVerifiedProfileLinkTicketIfExact/);
assert.match(src, /currentBound && !sameTicket/);
assert.match(src, /claim_pending/);
assert.match(src, /isBoundPendingVerifiedProfileLinkTicket/);
assert.match(src, /clearVerifiedProfileLinkTicketIfExact\(exact\)/);
assert.equal(
  (src.match(/clearVerifiedProfileLinkTicketIfExact\(exact\)/g) || []).length,
  2,
  "ack and permanent must both use compare-and-clear",
);

ticket.clearVerifiedProfileLinkTicket();

// --- Race 1: stale ACK after a newer ticket must not wipe the new one ---
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketOld,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});

let releaseClaim;
const claimGate = new Promise((resolve) => {
  releaseClaim = resolve;
});

const claimPromise = ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    await claimGate;
    return { ok: true };
  },
});

// While old claim awaits, a new unbound ticket is stored (simulates fresh issue).
assert.equal(
  ticket.storeVerifiedProfileLinkTicket({
    ticketId: ticketNew,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
  }),
  false,
  "store refuses to replace a different bound ticket mid-claim",
);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketOld);

// Force the post-await race: replace storage after bind by clearing then writing new
// (direct writeStorage path via clear + store as unbound new ticket).
ticket.clearVerifiedProfileLinkTicket();
assert.equal(
  ticket.storeVerifiedProfileLinkTicket({
    ticketId: ticketNew,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
  }),
  true,
);

releaseClaim();
const staleAck = await claimPromise;
assert.equal(staleAck.ok, true);
assert.equal(staleAck.ticketId, ticketOld);
assert.equal(
  ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId,
  ticketNew,
  "stale ACK must not clear the newer ticket",
);
assert.equal(
  ticket.clearVerifiedProfileLinkTicketIfExact({
    ticketId: ticketOld,
    boundChatId: chatId,
    boundMessageId: messageId,
  }),
  false,
);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketNew);

// --- Race 2: second copy with overwrite=true must not abandon a bound ticket ---
ticket.clearVerifiedProfileLinkTicket();
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketOld,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId });

let issueCalls = 0;
const recopied = await ticket.issueVerifiedProfileLinkTicket({
  username: "sex",
  ownerUid,
  overwrite: true,
  callIssue: async () => {
    issueCalls += 1;
    return {
      ticketId: ticketNew,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});
assert.equal(issueCalls, 0, "bound ticket must not trigger a new issue");
assert.equal(recopied.ok, false);
assert.equal(recopied.reason, "claim_pending");
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketOld);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundChatId, chatId);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

// Unbound may still be replaced by a fresh issue.
ticket.clearVerifiedProfileLinkTicket();
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketOld,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
const replaced = await ticket.issueVerifiedProfileLinkTicket({
  username: "sex",
  ownerUid,
  overwrite: true,
  callIssue: async () => {
    issueCalls += 1;
    return {
      ticketId: ticketNew,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 90_000,
    };
  },
});
assert.equal(issueCalls, 1);
assert.equal(replaced.ok, true);
assert.equal(replaced.ticket?.ticketId, ticketNew);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketNew);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, undefined);

// Issue-in-flight: bind wins if it happens before store.
ticket.clearVerifiedProfileLinkTicket();
let releaseIssue;
const issueGate = new Promise((resolve) => {
  releaseIssue = resolve;
});
const issuePromise = ticket.issueVerifiedProfileLinkTicket({
  username: "sex",
  ownerUid,
  overwrite: true,
  callIssue: async () => {
    await issueGate;
    return {
      ticketId: ticketNew,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketOld,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId: "msg_during_issue" });
releaseIssue();
const issueAfterBind = await issuePromise;
assert.equal(issueAfterBind.ok, false);
assert.equal(issueAfterBind.reason, "claim_pending");
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketOld);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, "msg_during_issue");

// Permanent stale clear also compare-and-swaps.
ticket.clearVerifiedProfileLinkTicket();
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketOld,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
let releasePerm;
const permGate = new Promise((resolve) => {
  releasePerm = resolve;
});
const permPromise = ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    await permGate;
    throw Object.assign(new Error("permission-denied"), { code: "permission-denied" });
  },
});
ticket.clearVerifiedProfileLinkTicket();
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketNew,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
releasePerm();
const stalePerm = await permPromise;
assert.equal(stalePerm.ok, false);
assert.equal(stalePerm.retryable, false);
assert.equal(
  ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId,
  ticketNew,
  "stale permanent clear must not wipe newer ticket",
);

console.log(
  JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK_TICKET_RACE", pass: true }, null, 2),
);
