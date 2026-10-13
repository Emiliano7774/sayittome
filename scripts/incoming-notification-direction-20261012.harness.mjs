import assert from "node:assert/strict";
import fs from "node:fs";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";
installHarnessWindow(); installHarnessAlias();
const { chatNotificationDirection: direction, classifiedInboxNotificationIds } = await import("../src/lib/chat/incomingChatNotification.ts");
const { resolveChatViewerId } = await import("../src/lib/chat/inboxPeerTitle.ts");
const { tryAlertIncomingMessage, markLocalOutgoingMessageId } = await import("../src/lib/chat/whipAlertDedupe.ts");
const me = "owner-fixture", anon = "anon_visitor_fixture";
const chat = { id: `${anon}__anon_to__fixture`, targetUid: me, receptorUid: me,
  participantes: [anon, me], anonSessionId: anon, latestMessageId: "m1", lastMessageSender: anon, latestSenderKind: "anon" };
const ownerViewer = resolveChatViewerId(chat, me);
assert.equal(direction({ fromUid: anon }, ownerViewer, me, chat), "incoming");
assert.equal(direction({ fromUid: `profile_${me}` }, ownerViewer, me, chat), "own");
assert.equal(direction({ fromUid: anon, senderAuthUid: me }, ownerViewer, me, chat), "own");
assert.equal(direction({ fromUid: "anon_old" }, anon, "visitor-auth", chat), "own", "rotation doesn't make old own messages incoming");
assert.equal(direction({ fromUid: `profile_${me}` }, anon, "visitor-auth", chat), "incoming");
assert.equal(direction({ fromUid: "peer", senderKind: "profile" }, me, me, { id: "regular" }), "incoming");
assert.equal(direction({ fromUid: me, senderKind: "profile" }, me, me, { id: "regular" }), "own");
assert.equal(direction({}, me, me, chat), "unknown");
const unresolved = { id: chat.id, latestMessageId: "m2", lastMessageSender: "", latestSenderKind: "anon" };
const previous = new Map([[chat.id, "m1"]]);
assert.equal(classifiedInboxNotificationIds([unresolved], me, previous).get(chat.id), "m1");
assert.equal(classifiedInboxNotificationIds([{ ...chat, latestMessageId: "m2" }], me, previous).get(chat.id), "m2");
let notices = 0;
for (const messageId of ["new1", "new2", "new3"]) {
  assert.equal(tryAlertIncomingMessage({ chatId: chat.id, messageId, incoming: true, suppress: false, onAlert: () => notices++ }), true);
}
markLocalOutgoingMessageId(chat.id, "my-send");
assert.equal(tryAlertIncomingMessage({ chatId: chat.id, messageId: "my-send", incoming: true, suppress: false, onAlert: () => notices++ }), false);
assert.equal(notices, 3);
const detail = fs.readFileSync(new URL("../src/hooks/useIncomingMessageWhip.ts", import.meta.url), "utf8");
assert.match(detail, /messageId: last\.id/);
assert.match(detail, /viewingActiveChat: true/);
const manager = fs.readFileSync(new URL("../src/lib/chat/globalChatWhipManager.ts", import.meta.url), "utf8");
assert.match(manager, /suppress: viewingActiveChat && isCapacitorNative\(\)/);
console.log("PASS incoming_direction: own/peer, rotation, canonical author, ordinary profile chat, late metadata same id, repeats and detail id");
