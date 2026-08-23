/**
 * CHAT_OFFICIAL_PROFILE_LINK_CLAIM_PENDING_COPY
 * Bound ticket before copy / bind-during-issue => claim_pending, zero clipboard.
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
const link = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedLink.ts")).href
);

const OFFICIAL = "https://sytm.me/@sex";
const ownerUid = "uid_owner";
const chatId = "chat_pending";
const messageId = "msg_bound";
const ticketBound = "d".repeat(40);
const ticketFresh = "e".repeat(40);

const PENDING_MSG = "El link anterior todavía se está verificando. Reintentá en unos segundos";

const ticketSrc = fs.readFileSync(
  path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"),
  "utf8",
);
const linkSrc = fs.readFileSync(path.join(root, "src/lib/profile/verifiedLink.ts"), "utf8");
const bubbleSrc = fs.readFileSync(
  path.join(root, "src/components/profile/VerifiedLinkBubble.tsx"),
  "utf8",
);

assert.match(ticketSrc, /reason: "claim_pending"/);
assert.match(linkSrc, /reason: "claim_pending"/);
assert.match(linkSrc, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(bubbleSrc, /VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE/);
assert.match(bubbleSrc, /result\.reason === "claim_pending"/);
assert.match(
  bubbleSrc,
  /if \(result\.reason === "claim_pending"\) \{\s*\/\/ Fail-closed:[^}]+setError\(VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE\);\s*return;/,
);
assert.doesNotMatch(
  bubbleSrc.match(
    /if \(result\.reason === "claim_pending"\) \{[\s\S]*?return;\s*\}/,
  )?.[0] || "",
  /setModalLink|showToast\(/,
);
assert.equal(link.VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE, PENDING_MSG);

function resetBound() {
  ticket.clearVerifiedProfileLinkTicket();
  ticket.storeVerifiedProfileLinkTicket({
    ticketId: ticketBound,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
  });
  ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId });
}

// --- before-bound: Copy while claim in flight ---
resetBound();
let clipboardWrites = 0;
let retryKicks = 0;
let issueCalls = 0;

const beforeBound = await link.copyVerifiedProfileLink("sex", {
  overwriteTicket: true,
  ownerUid,
  assertOwner: async () => true,
  writeText: async () => {
    clipboardWrites += 1;
    return true;
  },
  scheduleRetry: () => {
    retryKicks += 1;
  },
  callIssue: async () => {
    issueCalls += 1;
    return {
      ticketId: ticketFresh,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});

assert.equal(beforeBound.ok, false);
assert.equal(beforeBound.reason, "claim_pending");
assert.equal(beforeBound.link, "");
assert.equal(clipboardWrites, 0, "before-bound must not touch clipboard");
assert.equal(issueCalls, 0, "before-bound must not call issue");
assert.equal(retryKicks, 1, "before-bound must arm/kick claim retry");
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketBound);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

// After clear, a new press may issue a fresh ticket and copy.
ticket.clearVerifiedProfileLinkTicket();
clipboardWrites = 0;
retryKicks = 0;
issueCalls = 0;
const afterClear = await link.copyVerifiedProfileLink("sex", {
  overwriteTicket: true,
  ownerUid,
  assertOwner: async () => true,
  writeText: async (text) => {
    clipboardWrites += 1;
    assert.equal(text, OFFICIAL);
    return true;
  },
  scheduleRetry: () => {
    retryKicks += 1;
  },
  callIssue: async () => {
    issueCalls += 1;
    return {
      ticketId: ticketFresh,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});
assert.equal(afterClear.ok, true);
assert.equal(afterClear.ticketId, ticketFresh);
assert.equal(clipboardWrites, 1);
assert.equal(issueCalls, 1);
assert.equal(retryKicks, 0);

// --- bound-during-await: discard new issuance, claim_pending, zero clipboard ---
ticket.clearVerifiedProfileLinkTicket();
clipboardWrites = 0;
retryKicks = 0;
issueCalls = 0;
let releaseIssue;
const issueGate = new Promise((resolve) => {
  releaseIssue = resolve;
});
let markEntered;
const issueEntered = new Promise((resolve) => {
  markEntered = resolve;
});

const duringPromise = link.copyVerifiedProfileLink("sex", {
  overwriteTicket: true,
  ownerUid,
  assertOwner: async () => true,
  writeText: async () => {
    clipboardWrites += 1;
    return true;
  },
  scheduleRetry: () => {
    retryKicks += 1;
  },
  callIssue: async () => {
    issueCalls += 1;
    markEntered();
    await issueGate;
    return {
      ticketId: ticketFresh,
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});

await issueEntered;
ticket.storeVerifiedProfileLinkTicket({
  ticketId: ticketBound,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId: "msg_during_await" });
releaseIssue();

const duringAwait = await duringPromise;
assert.equal(duringAwait.ok, false);
assert.equal(duringAwait.reason, "claim_pending");
assert.equal(duringAwait.link, "");
assert.equal(clipboardWrites, 0, "bound-during-await must not touch clipboard");
assert.equal(issueCalls, 1, "issue may start but must be discarded");
assert.equal(retryKicks, 1);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketBound);
assert.equal(
  ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId,
  "msg_during_await",
);

console.log(
  JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK_CLAIM_PENDING_COPY", pass: true }, null, 2),
);
