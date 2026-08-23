/**
 * PUSH_CHAT_READ_PERSIST
 * Cold/warm push open + exit/back persist read only after inbound was seen.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const pushSrc = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");

assert.match(chatSrc, /resolveDetailReadMark/);
assert.match(chatSrc, /resolveLeaveThreadRead/);
assert.match(chatSrc, /pagehide/);
assert.match(chatSrc, /flushSeenThreadReadOnLeave/);
assert.match(chatSrc, /markThreadReadExact/);
assert.match(pushSrc, /resolvePushChatOpen/);
assert.match(pushSrc, /pushNotificationActionPerformed/);

const read = await import(
  pathToFileURL(path.join(root, "src/lib/chat/shouldMarkThreadRead.ts")).href
);
const push = await import(pathToFileURL(path.join(root, "src/lib/chat/fcmPush.ts")).href);
const unread = await import(pathToFileURL(path.join(root, "src/lib/chat/unread.ts")).href);

const thread = {
  viewerIdentity: "owner-1",
  canonicalThreadId: "chat-1",
  activeDetailThreadId: "chat-1",
  renderedInboundMessageIds: ["m-in"],
  latestInboundMessageId: "m-in",
};

assert.equal(
  read.resolveDetailReadMark({ ...thread, documentVisible: false }).mark,
  false,
);
assert.equal(read.resolveDetailReadMark({ ...thread, documentVisible: false }).reason, "hidden");

assert.equal(
  read.resolveDetailReadMark({
    ...thread,
    renderedInboundMessageIds: [],
    documentVisible: true,
  }).mark,
  false,
);

assert.equal(read.resolveDetailReadMark({ ...thread, documentVisible: true }).mark, true);

assert.equal(
  read.resolveLeaveThreadRead({ ...thread, seenVisible: false }).mark,
  false,
);
assert.equal(read.resolveLeaveThreadRead({ ...thread, seenVisible: false }).reason, "not-seen");
assert.equal(read.resolveLeaveThreadRead({ ...thread, seenVisible: true }).mark, true);

const cold = push.resolvePushChatOpen({ chatId: "chat-1", authed: false });
assert.equal(cold.kind, "queue");
push.queuePushChatIdForOpen(cold.chatId);
assert.equal(push.peekPendingPushChatId(), "chat-1");
assert.equal(push.drainQueuedPushChatIdForOpen(), "chat-1");
assert.equal(push.peekPendingPushChatId(), null);

const warm = push.resolvePushChatOpen({ chatId: "chat-1", authed: true });
assert.equal(warm.kind, "open");
assert.equal(warm.href, "/chat/chat-1");

const backLeave = read.resolveLeaveThreadRead({
  ...thread,
  seenVisible: true,
  alreadyMarkedKey: "chat-1:owner-1:m-in",
});
assert.equal(backLeave.mark, false);
assert.equal(backLeave.reason, "already");

assert.equal(typeof unread.markThreadReadExact, "function");

console.log(JSON.stringify({ gate: "PUSH_CHAT_READ_PERSIST", pass: true }, null, 2));
