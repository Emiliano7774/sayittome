/**
 * CHAT_OFFICIAL_PROFILE_LINK_CLAIM_RETRY
 * Transient/lost-ACK keeps bound ticket; single-flight retry resumes after reload;
 * exact binding only; never blocks send.
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

const OFFICIAL = "https://sytm.me/@sex";
const ownerUid = "uid_owner";
const chatId = "chat_bound";
const messageId = "msg_bound";
const ticketId = "c".repeat(40);

function resetTicket() {
  ticket.clearVerifiedProfileLinkTicket();
  ticket.storeVerifiedProfileLinkTicket({
    ticketId,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: Date.now() + 60_000,
  });
}

function waitResult(build) {
  return new Promise((resolve) => {
    const ctl = build((result) => resolve({ ctl, result }));
    ctl.arm();
  });
}

// --- Product source wiring ---
const modern = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const classic = fs.readFileSync(path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"), "utf8");
const authSrc = fs.readFileSync(path.join(root, "src/contexts/AuthContext.tsx"), "utf8");
const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
const retrySrc = fs.readFileSync(
  path.join(root, "src/lib/profile/verifiedProfileLinkClaimRetry.ts"),
  "utf8",
);

assert.match(modern, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(classic, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(modern, /armVerifiedProfileLinkClaimRetry/);
assert.match(classic, /armVerifiedProfileLinkClaimRetry/);
assert.match(modern, /claim\.retryable/);
assert.match(classic, /claim\.retryable/);
assert.match(authSrc, /armVerifiedProfileLinkClaimRetry/);
assert.match(logoutSrc, /disarmVerifiedProfileLinkClaimRetry/);
assert.match(retrySrc, /createVerifiedProfileLinkClaimRetryController/);
assert.match(retrySrc, /claimBoundVerifiedProfileLinkTicket/);
assert.match(retrySrc, /inFlight/);
assert.doesNotMatch(modern, /await scheduleVerifiedProfileLinkClaimRetry/);
assert.doesNotMatch(classic, /await scheduleVerifiedProfileLinkClaimRetry/);

assert.equal(retryMod.nextVerifiedProfileLinkClaimRetryDelayMs(0), 1_000);
assert.equal(retryMod.nextVerifiedProfileLinkClaimRetryDelayMs(1), 2_000);
assert.equal(retryMod.nextVerifiedProfileLinkClaimRetryDelayMs(10), 30_000);

// --- Transient claim leaves exact binding ---
resetTicket();
const transient = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    throw Object.assign(new Error("unavailable"), { code: "unavailable" });
  },
});
assert.equal(transient.ok, false);
assert.equal(transient.retryable, true);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundChatId, chatId);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.ticketId, ticketId);

// Other message must not consume the bound ticket.
const other = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId: "msg_other",
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => ({ ok: true }),
});
assert.equal(other.ok, false);
assert.equal(other.stage, "other-message");
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

// Bound-only helper never rebinds a different message.
const boundOnly = await retryMod.claimBoundVerifiedProfileLinkTicket({
  ownerUid,
  callClaim: async (payload) => {
    assert.equal(payload.chatId, chatId);
    assert.equal(payload.messageId, messageId);
    assert.equal(payload.ticketId, ticketId);
    throw Object.assign(new Error("unavailable"), { code: "unavailable" });
  },
});
assert.equal(boundOnly.retryable, true);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

// --- Offline arm schedules; online kick claims; reload resumes exact binding ---
resetTicket();
await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    throw Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" });
  },
});

const timers = [];
const listeners = new Map();
let claimAttempts = 0;
let online = false;

const offlineArm = retryMod.createVerifiedProfileLinkClaimRetryController({
  getOwnerUid: () => ownerUid,
  isOnline: () => online,
  isDocumentVisible: () => true,
  setTimeoutFn: (fn, ms) => {
    const handle = { fn, ms, id: timers.length + 1 };
    timers.push(handle);
    return handle;
  },
  clearTimeoutFn: (handle) => {
    const idx = timers.indexOf(handle);
    if (idx >= 0) timers.splice(idx, 1);
  },
  addWindowListener: (type, listener) => {
    listeners.set(type, listener);
  },
  removeWindowListener: (type) => {
    listeners.delete(type);
  },
  callClaim: async () => {
    claimAttempts += 1;
    throw Object.assign(new Error("unavailable"), { code: "unavailable" });
  },
});
offlineArm.arm();
assert.ok(listeners.has("online"));
assert.ok(listeners.has("pageshow"));
assert.equal(claimAttempts, 0);
assert.equal(timers.length, 1);
offlineArm.disarm();

online = true;
const firstOnline = await waitResult((onResult) =>
  retryMod.createVerifiedProfileLinkClaimRetryController({
    getOwnerUid: () => ownerUid,
    isOnline: () => true,
    isDocumentVisible: () => true,
    setTimeoutFn: () => ({ id: 50 }),
    clearTimeoutFn: () => {},
    addWindowListener: () => {},
    removeWindowListener: () => {},
    callClaim: async (payload) => {
      claimAttempts += 1;
      assert.equal(payload.messageId, messageId);
      throw Object.assign(new Error("unavailable"), { code: "unavailable" });
    },
    onResult,
  }),
);
assert.equal(firstOnline.result.retryable, true);
assert.equal(claimAttempts, 1);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);
firstOnline.ctl.disarm();

// Lost ACK / reload: new controller, same durable localStorage binding.
const reloaded = await waitResult((onResult) =>
  retryMod.createVerifiedProfileLinkClaimRetryController({
    getOwnerUid: () => ownerUid,
    isOnline: () => true,
    isDocumentVisible: () => true,
    setTimeoutFn: () => ({ id: 99 }),
    clearTimeoutFn: () => {},
    addWindowListener: () => {},
    removeWindowListener: () => {},
    callClaim: async (payload) => {
      claimAttempts += 1;
      assert.equal(payload.chatId, chatId);
      assert.equal(payload.messageId, messageId);
      assert.equal(payload.ticketId, ticketId);
      return { ok: true };
    },
    onResult,
  }),
);
assert.equal(reloaded.result.ok, true);
assert.equal(claimAttempts, 2);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null, "ack clears ticket");
reloaded.ctl.disarm();

// Permanent error stops retry and clears.
resetTicket();
ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId });
const permanent = await waitResult((onResult) =>
  retryMod.createVerifiedProfileLinkClaimRetryController({
    getOwnerUid: () => ownerUid,
    isOnline: () => true,
    isDocumentVisible: () => true,
    setTimeoutFn: () => ({ id: 1 }),
    clearTimeoutFn: () => {},
    addWindowListener: () => {},
    removeWindowListener: () => {},
    callClaim: async () => {
      throw Object.assign(new Error("permission-denied"), { code: "permission-denied" });
    },
    onResult,
  }),
);
assert.equal(permanent.result.retryable, false);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null);
assert.equal(permanent.ctl.getAttempt(), 0);
permanent.ctl.disarm();

// Single-flight: overlapping kicks coalesce.
resetTicket();
ticket.bindVerifiedProfileLinkTicket({ ownerUid, chatId, messageId });
let concurrent = 0;
let maxConcurrent = 0;
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const flightDone = new Promise((resolve) => {
  const flightCtl = retryMod.createVerifiedProfileLinkClaimRetryController({
    getOwnerUid: () => ownerUid,
    isOnline: () => true,
    isDocumentVisible: () => true,
    setTimeoutFn: () => ({ id: 2 }),
    clearTimeoutFn: () => {},
    addWindowListener: () => {},
    removeWindowListener: () => {},
    callClaim: async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await gate;
      concurrent -= 1;
      return { ok: true };
    },
    onResult: () => resolve(flightCtl),
  });
  flightCtl.arm();
  flightCtl.kick();
  assert.equal(flightCtl.isInFlight(), true);
  release();
});
const flightCtl = await flightDone;
assert.equal(maxConcurrent, 1, "single-flight never overlaps claim calls");
flightCtl.disarm();

console.log(
  JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK_CLAIM_RETRY", pass: true }, null, 2),
);
