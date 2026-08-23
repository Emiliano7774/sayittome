/**
 * CHAT_OFFICIAL_PROFILE_LINK_TICKET_DURABLE
 * localStorage survives WebView process death; empty session + local bound => Auth arm recovers;
 * expired / foreign UID wiped and never claimed/copied.
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
const retryMod = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedProfileLinkClaimRetry.ts")).href
);
const link = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedLink.ts")).href
);

const STORAGE_KEY = "sayittome:verified-profile-link-ticket";
const OFFICIAL = "https://sytm.me/@sex";
const ownerUid = "uid_owner";
const otherUid = "uid_other";
const chatId = "chat_durable";
const messageId = "msg_durable";
const ticketId = "f".repeat(40);

const ticketSrc = fs.readFileSync(
  path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"),
  "utf8",
);
const authSrc = fs.readFileSync(path.join(root, "src/contexts/AuthContext.tsx"), "utf8");
const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");

assert.match(ticketSrc, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(ticketSrc, /migrateSessionTicketToLocal/);
assert.match(ticketSrc, /scrubLegacySessionTicket/);
assert.match(ticketSrc, /Durable across WebView/);
assert.match(authSrc, /armVerifiedProfileLinkClaimRetry/);
assert.match(logoutSrc, /clearVerifiedProfileLinkTicket/);
assert.match(logoutSrc, /disarmVerifiedProfileLinkClaimRetry/);

function waitResult(build) {
  return new Promise((resolve) => {
    const ctl = build((result) => resolve({ ctl, result }));
    ctl.arm();
  });
}

function plantBoundInLocalStorage(overrides = {}) {
  const payload = {
    ticketId,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
    boundChatId: chatId,
    boundMessageId: messageId,
    ...overrides,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.sessionStorage.removeItem(STORAGE_KEY);
}

// --- New process: session empty, local bound valid => peek + Auth arm/retry recovers ---
ticket.clearVerifiedProfileLinkTicket();
plantBoundInLocalStorage();
assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);
assert.ok(window.localStorage.getItem(STORAGE_KEY));

const recovered = ticket.peekVerifiedProfileLinkTicket(ownerUid);
assert.equal(recovered?.ticketId, ticketId);
assert.equal(recovered?.boundChatId, chatId);
assert.equal(recovered?.boundMessageId, messageId);
assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null, "legacy session stays empty");

let claimAttempts = 0;
const resumed = await waitResult((onResult) =>
  retryMod.createVerifiedProfileLinkClaimRetryController({
    getOwnerUid: () => ownerUid,
    isOnline: () => true,
    isDocumentVisible: () => true,
    setTimeoutFn: () => ({ id: 1 }),
    clearTimeoutFn: () => {},
    addWindowListener: () => {},
    removeWindowListener: () => {},
    callClaim: async (payload) => {
      claimAttempts += 1;
      assert.equal(payload.ticketId, ticketId);
      assert.equal(payload.chatId, chatId);
      assert.equal(payload.messageId, messageId);
      return { ok: true };
    },
    onResult,
  }),
);
assert.equal(resumed.result.ok, true);
assert.equal(claimAttempts, 1, "Auth arm/retry recovered durable bound ticket");
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null);
resumed.ctl.disarm();

// --- One-shot migrate from legacy sessionStorage ---
ticket.clearVerifiedProfileLinkTicket();
window.sessionStorage.setItem(
  STORAGE_KEY,
  JSON.stringify({
    ticketId,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
    boundChatId: chatId,
    boundMessageId: messageId,
  }),
);
assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
const migrated = ticket.peekVerifiedProfileLinkTicket(ownerUid);
assert.equal(migrated?.ticketId, ticketId);
assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null, "session key deleted after migrate");
assert.ok(window.localStorage.getItem(STORAGE_KEY), "migrated into localStorage");

// --- Expired durable ticket wiped; never claim ---
ticket.clearVerifiedProfileLinkTicket();
plantBoundInLocalStorage({ expiresAtMs: Date.now() - 1_000 });
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null);
assert.equal(window.localStorage.getItem(STORAGE_KEY), null);

let expiredClaims = 0;
const expiredCtl = retryMod.createVerifiedProfileLinkClaimRetryController({
  getOwnerUid: () => ownerUid,
  isOnline: () => true,
  isDocumentVisible: () => true,
  setTimeoutFn: () => ({ id: 2 }),
  clearTimeoutFn: () => {},
  addWindowListener: () => {},
  removeWindowListener: () => {},
  callClaim: async () => {
    expiredClaims += 1;
    return { ok: true };
  },
});
expiredCtl.arm();
await Promise.resolve();
await Promise.resolve();
assert.equal(expiredClaims, 0, "expired ticket must never claim");
expiredCtl.disarm();

// Expired plant then copy: peek/issue path must not claim the expired binding.
plantBoundInLocalStorage({ expiresAtMs: Date.now() - 1_000 });
let clipboardWrites = 0;
let expiredIssueCalls = 0;
const expiredCopy = await link.copyVerifiedProfileLink("sex", {
  overwriteTicket: true,
  ownerUid,
  assertOwner: async () => true,
  writeText: async () => {
    clipboardWrites += 1;
    return true;
  },
  scheduleRetry: () => {},
  callIssue: async () => {
    expiredIssueCalls += 1;
    return {
      ticketId: "g".repeat(40),
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});
assert.equal(expiredCopy.ok, true);
assert.equal(expiredIssueCalls, 1, "expired wiped so a fresh issue is allowed");
assert.equal(clipboardWrites, 1);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, "g".repeat(40));

// --- Foreign UID: peek clears alien ticket; never claim that binding ---
ticket.clearVerifiedProfileLinkTicket();
plantBoundInLocalStorage({ ownerUid: otherUid });
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null, "foreign ticket wiped");
assert.equal(window.localStorage.getItem(STORAGE_KEY), null);

plantBoundInLocalStorage({ ownerUid: otherUid });
let foreignClaims = 0;
const foreignCtl = retryMod.createVerifiedProfileLinkClaimRetryController({
  getOwnerUid: () => ownerUid,
  isOnline: () => true,
  isDocumentVisible: () => true,
  setTimeoutFn: () => ({ id: 3 }),
  clearTimeoutFn: () => {},
  addWindowListener: () => {},
  removeWindowListener: () => {},
  callClaim: async () => {
    foreignClaims += 1;
    return { ok: true };
  },
});
foreignCtl.arm();
await Promise.resolve();
await Promise.resolve();
assert.equal(foreignClaims, 0, "foreign ticket must never claim");
assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
foreignCtl.disarm();

plantBoundInLocalStorage({ ownerUid: otherUid });
clipboardWrites = 0;
let issueCalls = 0;
const foreignCopy = await link.copyVerifiedProfileLink("sex", {
  overwriteTicket: true,
  ownerUid,
  assertOwner: async () => true,
  writeText: async () => {
    clipboardWrites += 1;
    return true;
  },
  scheduleRetry: () => {},
  callIssue: async () => {
    issueCalls += 1;
    return {
      ticketId: "h".repeat(40),
      text: OFFICIAL,
      expiresAtMs: Date.now() + 60_000,
    };
  },
});
assert.equal(foreignCopy.ok, true, "after wipe, owner may issue a fresh ticket");
assert.equal(issueCalls, 1);
assert.equal(clipboardWrites, 1);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ownerUid, ownerUid);

console.log(
  JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK_TICKET_DURABLE", pass: true }, null, 2),
);
