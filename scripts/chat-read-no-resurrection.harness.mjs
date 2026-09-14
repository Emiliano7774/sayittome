/**
 * CHAT_READ_NO_RESURRECTION — stale overlapping inbox rows must not revive unread.
 * Uses real dedupeInboxChats via harness @/ alias (no product-logic copy).
 *   node --experimental-strip-types scripts/chat-read-no-resurrection.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessAlias(root);

const { dedupeInboxChats } = await import(
  pathToFileURL(path.join(root, "src/lib/chat/inboxPeerTitle.ts")).href
);

const ts = (ms) => ({ toMillis: () => ms });
const base = {
  id: "thread-1",
  canonicalChatId: "thread-1",
  targetUsername: "peer",
  lastMessage: "hola",
  lastMessageSender: "peer_uid",
  latestMessageId: "m10",
  updatedAt: ts(1000),
};

const stale = {
  ...base,
  unreadCounts: { viewer_uid: 1 },
  readBy: { viewer_uid: false },
  readAt: { viewer_uid: ts(500) },
};

const freshRead = {
  ...base,
  unreadCounts: { viewer_uid: 0 },
  readBy: { viewer_uid: true },
  readAt: { viewer_uid: ts(2000) },
  latestReadMessageId: "m10",
  latestReadMessageIds: { viewer_uid: "m10" },
};
const merged = dedupeInboxChats([freshRead, stale], "viewer_uid")[0];
assert.equal(merged.unreadCounts?.viewer_uid, 0, "stale overlapping query must not resurrect unread");
assert.equal(merged.readBy?.viewer_uid, true, "true read state must be monotonic for same latest message");
assert.equal(merged.latestReadMessageIds?.viewer_uid, "m10");
assert.equal(merged.readAt?.viewer_uid?.toMillis?.(), 2000);

const newer = {
  ...stale,
  latestMessageId: "m11",
  lastMessage: "nuevo",
  updatedAt: ts(3000),
  unreadCounts: { viewer_uid: 1 },
  readBy: { viewer_uid: false },
};
const newActivity = dedupeInboxChats([freshRead, newer], "viewer_uid")[0];
assert.equal(newActivity.latestMessageId, "m11");
assert.equal(newActivity.unreadCounts?.viewer_uid, 1, "new message must remain unread");
assert.equal(newActivity.readBy?.viewer_uid, false, "old read state must not cross a new activity id");

console.log(JSON.stringify({ gate: "CHAT_READ_NO_RESURRECTION", pass: true }));
