/**
 * CHAT_UNREAD_BOLD_TAB_RETURN — opened chat stays non-bold after recovery rewrite.
 *   node --experimental-strip-types scripts/chat-unread-bold-tab-return.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const local = await import(
  pathToFileURL(path.join(root, "src/lib/chat/localChatRead.ts")).href
);
const pending = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadPending.ts")).href
);

globalThis.localStorage.clear();

const chat = {
  id: "profile_user__anon_visitor",
  canonicalChatId: "profile_user__anon_visitor",
  lastMessage: "hola",
  lastMessageSender: "profile_owneruid",
  latestSenderKind: "profile",
  latestMessageId: "m1",
  lastMessageAt: { toMillis: () => 200_000 },
  unreadCounts: { anon_visitor: 1 },
  readBy: { anon_visitor: false },
  anonSessionId: "anon_visitor",
  participantes: ["anon_visitor", "owneruid"],
};

local.markChatReadLocally(chat, "anon_visitor", "");
const opened = pending.computeThreadPendingForViewer(chat, "", "");
assert.equal(opened.computedPending, false, "open clears pending");
assert.equal(opened.localRead, true);

// Tab return: forceAnonRecovery / prefer rewrite drops latestMessageId + readAt
// while server unreadCounts may still be stale.
const afterTab = {
  ...chat,
  latestMessageId: undefined,
  readAt: undefined,
  latestReadMessageIds: undefined,
  unreadCounts: { anon_visitor: 1 },
  readBy: { anon_visitor: false },
};
const restored = pending.computeThreadPendingForViewer(afterTab, "", "");
assert.equal(
  restored.computedPending,
  false,
  `tab return must stay read (got ${restored.reason})`,
);
assert.equal(restored.localRead, true);

// Server readBy=true with stripped readAt must not re-bold via latest-after-read.
globalThis.localStorage.clear();
const serverRead = {
  ...chat,
  latestMessageId: "m1",
  unreadCounts: { anon_visitor: 0 },
  readBy: { anon_visitor: true },
  readAt: undefined,
};
const serverState = pending.computeThreadPendingForViewer(serverRead, "", "");
assert.equal(serverState.computedPending, false);
assert.equal(serverState.reason, "server-read-current");

// New inbound text must still pending after prior local read of older preview.
globalThis.localStorage.clear();
local.markChatReadLocally(chat, "anon_visitor", "");
const newer = {
  ...chat,
  lastMessage: "nuevo",
  latestMessageId: "m2",
  lastMessageAt: { toMillis: () => 300_000 },
  unreadCounts: { anon_visitor: 1 },
  readBy: { anon_visitor: false },
};
const newerState = pending.computeThreadPendingForViewer(newer, "", "");
assert.equal(newerState.computedPending, true);

const localSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/localChatRead.ts"),
  "utf8",
);
assert.match(localSrc, /readTextCacheKey/);
assert.match(localSrc, /textActivityKey/);

const recoverySrc = fs.readFileSync(
  path.join(root, "src/app/api/chat/anon-inbox-recovery/route.ts"),
  "utf8",
);
assert.match(recoverySrc, /readAt:/);
assert.match(recoverySrc, /latestReadMessageIds/);

console.log("PASS chat-unread-bold-tab-return");
