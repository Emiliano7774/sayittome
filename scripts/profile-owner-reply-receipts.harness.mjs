/**
 * PROFILE_OWNER_REPLY_RECEIPTS — the owner's reply must satisfy the deployed
 * Firestore rules for an atomic outgoing send on a profile-anon thread.
 *
 * Regression it locks: replies were authored as `profile_<uid>` and keyed their
 * own readBy/typing under that alias, while the rules require the raw receptor
 * uid. Every owner reply was rejected (no reply reached Firestore between
 * 2026-09-13 and 2026-09-30) and the UI painted the rejection as "this
 * anonymous user blocked you", which also locked the composer.
 *   node --experimental-strip-types scripts/profile-owner-reply-receipts.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const payload = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonSendPayload.ts")).href
);

const ownerUid = "766TxAUdYbd4L3oyrIhUOlI2RyS2";
const ownerAlias = `profile_${ownerUid}`;
const threadAnon = "anon_gakurzpwg9_muno633r";

// Mirrors onlyOutgoingSendChatMetaKeys() in the deployed ruleset: the owner send
// may touch nothing else on the chat doc.
const OWNER_SEND_CHAT_KEYS = [
  "lastMessage",
  "lastMessageSender",
  "updatedAt",
  "lastMessageAt",
  "latestMessageId",
  "latestSenderKind",
  "latestSenderAnonSessionId",
  "typing",
  "readBy",
  "unreadCounts",
  "targetPhoto",
  "senderIsAnonymous",
];

const ownerBatch = payload.buildProfileAnonAtomicSendBatch({
  messageText: "te respondo",
  messageId: "msg_owner_1",
  senderAuthorId: ownerAlias,
  receiptSenderId: ownerUid,
  senderKind: "profile",
  senderRole: "profile",
  unreadRecipients: [threadAnon],
  senderIsAnonymous: false,
  persistAuthUid: ownerUid,
  senderAuthUid: ownerUid,
});

const chat = ownerBatch.chatWritePayload;

for (const key of Object.keys(chat)) {
  assert.ok(
    OWNER_SEND_CHAT_KEYS.includes(key),
    `owner send writes ${key}, which the deployed rules reject`,
  );
}

// ownerOutgoingSendReadByAllowed: readBy[receptor] must be true, visitor false.
assert.equal(chat.readBy[ownerUid], true);
assert.equal(chat.readBy[threadAnon], false);
// Alias mirror is permitted and keeps alias-based read checks consistent.
assert.equal(chat.readBy[ownerAlias], true);
assert.deepEqual(
  Object.keys(chat.readBy).sort(),
  [ownerUid, ownerAlias, threadAnon].sort(),
);

// ownerOutgoingSendTypingAllowed: exactly the receptor key, set to false.
assert.deepEqual(Object.keys(chat.typing), [ownerUid]);
assert.equal(chat.typing[ownerUid], false);

// ownerOutgoingSendUnreadAllowed: only the thread visitor may be dirtied.
assert.deepEqual(Object.keys(chat.unreadCounts), [threadAnon]);

// ownerOutgoingSendLastMessageSenderAllowed accepts receptor or its alias.
assert.ok([ownerUid, ownerAlias].includes(chat.lastMessageSender));
// ownerAtomicOutgoingMessage reads the message that lands in the same batch.
assert.equal(ownerBatch.messagePayload.senderKind, "profile");
assert.ok([ownerUid, ownerAlias].includes(ownerBatch.messagePayload.fromUid));
assert.equal(chat.latestSenderKind, "profile");
// outgoingLatestSenderAnonValid: owner sends carry no visitor anon id.
assert.equal(chat.latestSenderAnonSessionId, "");

// The visitor path keeps keying receipts by its own anon identity.
const visitorBatch = payload.buildProfileAnonAtomicSendBatch({
  messageText: "hola",
  messageId: "msg_anon_1",
  senderAuthorId: threadAnon,
  senderKind: "anon",
  senderRole: "anon",
  unreadRecipients: [ownerUid],
  latestSenderAnonSessionId: threadAnon,
  senderIsAnonymous: true,
  abuseSendPermitId: "permit_1234567890",
});
const visitorChat = visitorBatch.chatWritePayload;
assert.equal(visitorChat.readBy[threadAnon], true);
assert.deepEqual(Object.keys(visitorChat.typing), [threadAnon]);
assert.equal(visitorChat.readBy[ownerUid], false);
assert.equal(visitorChat.readBy[ownerAlias], false);
assert.equal(visitorChat.latestSenderAnonSessionId, threadAnon);

// Owner unread must collapse to the single visitor named by the chatId, even
// when the doc carries a poisoned anonSessionId or a stray anon participant.
const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /if \(chatIdAnon\) return \[chatIdAnon\];/);
assert.match(
  persistSrc,
  /receiptSenderId: isOwnerReply \? resolvedTargetUid \|\| persistAuthUid : undefined/,
);

// A rules rejection must never be reported as a block by the visitor.
const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const blockedAt = chatSrc.indexOf("setProfileBlockedByAnon(true);");
assert.ok(blockedAt > 0);
const blockedBranch = chatSrc.slice(Math.max(0, blockedAt - 700), blockedAt);
assert.doesNotMatch(blockedBranch, /permission-denied/i);
assert.match(blockedBranch, /"blocked_by_anon"/);

console.log(JSON.stringify({ gate: "PROFILE_OWNER_REPLY_RECEIPTS", pass: true }, null, 2));
