/**
 * R3/R5 — Functions private auth: membership, view-once, verified link claim/verify/scrub.
 * Uses compiled functions/lib (run `npm run build` in functions/ first).
 * Usage: node scripts/profile-anon-private-auth-functions.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const lib = path.join(root, "functions/lib");
const deleteCore = require(path.join(lib, "deleteChatMessageCore.js"));
const linkCore = require(path.join(lib, "verifiedProfileLinkCore.js"));
const viewOnceCore = require(path.join(lib, "viewOnceClaimCore.js"));
const { resolvePushRecipientUids } = require(path.join(lib, "index.js"));

const VISITOR = "visitor_firebase_uid";
const STRANGER = "stranger_firebase_uid";
const OWNER = "owner_profile_uid";
const ANON = "anon_verified_session";
const CHAT_ID = `${ANON}__anon_to__profile_demo`;
const OFFICIAL = "https://sytm.me/@demoowner";
const SECRET = "unit-test-mac-secret-16b";
const ticketId = "c".repeat(40);
const NOW_MS = 1_700_000_000_000;
const TICKET_EXPIRES_MS = NOW_MS + 120_000;

const chat = {
  participantes: [ANON, OWNER],
  anonSessionId: ANON,
  receptorUid: OWNER,
  targetUid: OWNER,
};

assert.equal(
  deleteCore.isChatMember({
    uid: VISITOR,
    chat,
    message: { fromUid: OWNER, senderKind: "profile" },
    privateVisitorAuthUid: VISITOR,
  }),
  true,
  "lease-bound visitor is member for owner reply",
);

assert.equal(
  deleteCore.isChatMember({
    uid: STRANGER,
    chat,
    message: { fromUid: OWNER, senderKind: "profile" },
    privateVisitorAuthUid: VISITOR,
  }),
  false,
  "foreign uid is not member",
);

const hideOwnerReply = deleteCore.decideChatMessageDelete({
  uid: VISITOR,
  mode: "me",
  chatId: CHAT_ID,
  messageId: "msg_owner_reply",
  chat,
  message: { fromUid: OWNER, senderKind: "profile", hiddenFor: {} },
  privateVisitorAuthUid: VISITOR,
});
assert.equal(hideOwnerReply.ok, true);
assert.equal(hideOwnerReply.mode, "me");

const denyEveryoneOnOwner = deleteCore.decideChatMessageDelete({
  uid: VISITOR,
  mode: "everyone",
  chatId: CHAT_ID,
  messageId: "msg_owner_reply",
  chat,
  message: { fromUid: OWNER, senderKind: "profile" },
  privateVisitorAuthUid: VISITOR,
});
assert.equal(denyEveryoneOnOwner.ok, false);
assert.equal(denyEveryoneOnOwner.error, "permission-denied");

const ownerBombClaim = viewOnceCore.decideViewOnceClaim({
  uid: VISITOR,
  isMember: deleteCore.isChatMember({
    uid: VISITOR,
    chat,
    message: { fromUid: OWNER, viewOnce: true, senderKind: "profile" },
    privateVisitorAuthUid: VISITOR,
  }),
  message: { viewOnce: true, fromUid: OWNER, senderKind: "profile" },
  secretMediaUrl: "https://cdn.example/bomb.jpg",
  authorContext: { chat, privateVisitorAuthUid: VISITOR },
});
assert.equal(ownerBombClaim.ok, true, "visitor can claim owner view-once");

const authorBlocked = viewOnceCore.decideViewOnceClaim({
  uid: OWNER,
  isMember: true,
  message: { viewOnce: true, fromUid: OWNER, senderKind: "profile" },
  secretMediaUrl: "https://cdn.example/bomb.jpg",
  authorContext: { chat, privateVisitorAuthUid: VISITOR },
});
assert.equal(authorBlocked.ok, false);
assert.equal(authorBlocked.reason, "author");

const anonOwnerMessage = {
  fromUid: ANON,
  senderKind: "anon",
  texto: OFFICIAL,
  text: OFFICIAL,
};

assert.equal(
  deleteCore.resolveVerifiedProfileMessageAuthorUid(anonOwnerMessage, {
    privateVisitorAuthUid: OWNER,
    chat,
  }),
  OWNER,
  "anon presentation resolves to private ticket owner",
);

assert.equal(
  deleteCore.resolveVerifiedProfileMessageAuthorUid(anonOwnerMessage, {
    privateVisitorAuthUid: VISITOR,
    chat,
  }),
  VISITOR,
  "regular visitor resolves to own private uid",
);

const signed = linkCore.signVerifiedProfileLinkTicket(SECRET, {
  ticketId,
  ownerUid: OWNER,
  username: "demoowner",
  text: OFFICIAL,
  expiresAtMs: TICKET_EXPIRES_MS,
  consumed: false,
});
assert.equal(signed.ok, true);

const claimOk = linkCore.decideClaimVerifiedProfileLinkTicket({
  uid: OWNER,
  secret: SECRET,
  ticket: {
    ticketId,
    ownerUid: OWNER,
    username: "demoowner",
    text: OFFICIAL,
    expiresAtMs: TICKET_EXPIRES_MS,
    consumed: false,
    mac: signed.mac,
  },
  messageText: OFFICIAL,
  messageAuthorUid: deleteCore.resolveVerifiedProfileMessageAuthorUid(anonOwnerMessage, {
    privateVisitorAuthUid: OWNER,
    chat,
  }),
  chatId: CHAT_ID,
  messageId: "msg_link",
  nowMs: NOW_MS,
});
assert.equal(claimOk.ok, true, "claim positive for owner copy+paste as anon");

const consumedMac = linkCore.signVerifiedProfileLinkTicket(SECRET, {
  ticketId,
  ownerUid: OWNER,
  username: "demoowner",
  text: OFFICIAL,
  expiresAtMs: TICKET_EXPIRES_MS,
  consumed: true,
  consumedChatId: CHAT_ID,
  consumedMessageId: "msg_link",
});

const verifyOk = linkCore.decideVerifyVerifiedProfileLink({
  secret: SECRET,
  ticket: {
    ticketId,
    ownerUid: OWNER,
    username: "demoowner",
    text: OFFICIAL,
    expiresAtMs: TICKET_EXPIRES_MS,
    consumed: true,
    consumedChatId: CHAT_ID,
    consumedMessageId: "msg_link",
    mac: consumedMac.mac,
  },
  messageText: OFFICIAL,
  messageAuthorUid: deleteCore.resolveVerifiedProfileMessageAuthorUid(anonOwnerMessage, {
    privateVisitorAuthUid: OWNER,
    chat,
  }),
  chatId: CHAT_ID,
  messageId: "msg_link",
});
assert.equal(verifyOk.ok, true, "verify positive for owner copy+paste as anon");

const scrubKeep = linkCore.decideKeepVerifiedProfileAttestation({
  attestation: { ticketId },
  secret: SECRET,
  ticket: {
    ticketId,
    ownerUid: OWNER,
    username: "demoowner",
    text: OFFICIAL,
    expiresAtMs: TICKET_EXPIRES_MS,
    consumed: true,
    consumedChatId: CHAT_ID,
    consumedMessageId: "msg_link",
    mac: consumedMac.mac,
  },
  chatId: CHAT_ID,
  messageId: "msg_link",
  messageText: OFFICIAL,
  messageAuthorUid: deleteCore.resolveVerifiedProfileMessageAuthorUid(anonOwnerMessage, {
    privateVisitorAuthUid: OWNER,
    chat,
  }),
});
assert.equal(scrubKeep, "keep");

const wrongOwnerClaim = linkCore.decideClaimVerifiedProfileLinkTicket({
  uid: OWNER,
  secret: SECRET,
  ticket: {
    ticketId,
    ownerUid: OWNER,
    username: "demoowner",
    text: OFFICIAL,
    expiresAtMs: TICKET_EXPIRES_MS,
    consumed: false,
    mac: signed.mac,
  },
  messageText: OFFICIAL,
  messageAuthorUid: deleteCore.resolveVerifiedProfileMessageAuthorUid(
    { fromUid: ANON, senderKind: "anon", texto: OFFICIAL },
    { privateVisitorAuthUid: VISITOR, chat },
  ),
  chatId: CHAT_ID,
  messageId: "msg_typed",
  nowMs: NOW_MS,
});
assert.equal(wrongOwnerClaim.ok, false, "owner ticket cannot claim visitor typed URL");

const pushRecipients = resolvePushRecipientUids(
  { fromUid: OWNER, senderKind: "profile" },
  chat,
  VISITOR,
);
assert.ok(pushRecipients.includes(VISITOR), "owner reply push includes lease visitor");
assert.ok(!pushRecipients.includes(OWNER), "sender excluded from push");

const pushToOwner = resolvePushRecipientUids(
  { fromUid: ANON, senderKind: "anon" },
  chat,
  VISITOR,
);
assert.ok(pushToOwner.includes(OWNER), "visitor message push includes profile owner");

console.log(
  JSON.stringify({
    gate: "PROFILE_ANON_PRIVATE_AUTH_FUNCTIONS",
    pass: true,
    note: "R5 membership + verified link + push both directions",
  }),
);
