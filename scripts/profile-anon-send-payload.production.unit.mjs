/**
 * Production-path smoke for shared profile anon send payload (R4).
 * Usage: node --experimental-strip-types scripts/profile-anon-send-payload.production.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const {
  buildProfileAnonAtomicSendBatch,
  buildProfileAnonMessagePayload,
  buildProfileAnonChatWritePayload,
} = await import(pathToFileURL(path.join(root, "src/lib/chat/profileAnonSendPayload.ts")).href);

function isIncrementField(value) {
  return (
    value &&
    typeof value === "object" &&
    (value._methodName === "increment" ||
      (typeof value._delegate?.methodName === "string" &&
        value._delegate.methodName.includes("increment")))
  );
}

function isServerTimestampField(value) {
  return (
    value &&
    typeof value === "object" &&
    (value._methodName === "serverTimestamp" ||
      (typeof value._delegate?.methodName === "string" &&
        value._delegate.methodName.includes("serverTimestamp")))
  );
}

const RECEPTOR = "owner_uid_prod";
const ANON = "anon_session_prod";
const MSG = "msg_prod_1";
const MSG2 = "msg_prod_2";

const visitorBatch = buildProfileAnonAtomicSendBatch({
  messageText: "hola real",
  messageId: MSG,
  senderAuthorId: ANON,
  senderKind: "anon",
  senderRole: "anon",
  unreadRecipients: [RECEPTOR],
  latestSenderAnonSessionId: ANON,
  senderIsAnonymous: true,
  abuseSendPermitId: "permit_prod",
});

assert.equal(typeof visitorBatch.chatWritePayload.lastMessage, "string");
assert.ok(isServerTimestampField(visitorBatch.chatWritePayload.updatedAt));
assert.ok(isServerTimestampField(visitorBatch.chatWritePayload.lastMessageAt));
assert.ok(isServerTimestampField(visitorBatch.messagePayload.createdAt));

const unread = visitorBatch.chatWritePayload.unreadCounts;
assert.ok(unread && typeof unread === "object");
assert.ok(isIncrementField(unread[RECEPTOR]));
assert.ok(isIncrementField(unread[`profile_${RECEPTOR}`]));

const readBy = visitorBatch.chatWritePayload.readBy;
assert.equal(readBy[ANON], true);
assert.equal(readBy[RECEPTOR], false);
assert.equal(readBy[`profile_${RECEPTOR}`], false);

assert.equal("senderAuthUid" in visitorBatch.messagePayload, false);
assert.equal("createdByAuthUid" in visitorBatch.messagePayload, false);

const ownerBatch = buildProfileAnonAtomicSendBatch({
  messageText: "respuesta owner",
  messageId: MSG2,
  senderAuthorId: RECEPTOR,
  senderKind: "profile",
  senderRole: "profile",
  unreadRecipients: [ANON],
  latestSenderAnonSessionId: ANON,
  senderIsAnonymous: false,
  persistAuthUid: RECEPTOR,
  senderAuthUid: RECEPTOR,
  senderProfileId: RECEPTOR,
  profileUid: RECEPTOR,
});

assert.equal(ownerBatch.chatWritePayload.readBy[RECEPTOR], true);
assert.equal(ownerBatch.chatWritePayload.readBy[ANON], false);
assert.equal("profile_" + RECEPTOR in ownerBatch.chatWritePayload.readBy, false);
assert.ok(isIncrementField(ownerBatch.chatWritePayload.unreadCounts[ANON]));
assert.equal(ownerBatch.messagePayload.senderAuthUid, RECEPTOR);

const secondVisitor = buildProfileAnonChatWritePayload({
  senderAuthorId: ANON,
  unreadRecipients: [RECEPTOR],
  lastMessage: "segundo",
  latestMessageId: "msg_prod_3",
  latestSenderKind: "anon",
  latestSenderAnonSessionId: ANON,
  senderIsAnonymous: true,
});
assert.ok(isIncrementField(secondVisitor.unreadCounts[RECEPTOR]));

const ownerMessageOnly = buildProfileAnonMessagePayload({
  messageText: "link",
  senderAuthorId: RECEPTOR,
  senderKind: "profile",
  senderRole: "profile",
  persistAuthUid: RECEPTOR,
  profileUid: RECEPTOR,
});
assert.equal(ownerMessageOnly.profileUid, RECEPTOR);

console.log(
  JSON.stringify({
    gate: "PROFILE_ANON_SEND_PAYLOAD_PRODUCTION",
    pass: true,
    note: "shared constructor uses increment/serverTimestamp; no emulator branch",
  }),
);
