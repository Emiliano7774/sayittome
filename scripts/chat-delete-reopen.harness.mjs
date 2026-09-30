/**
 * Deleting a profile-anon chat must not come back when reopening B from the profile.
 *
 * Usage: node --experimental-strip-types scripts/chat-delete-reopen.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const deleted = await import(
  pathToFileURL(path.join(root, "src/lib/chat/deletedInboxChats.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);
const pages = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatHistoryPages.ts")).href
);
const own = await import(
  pathToFileURL(path.join(root, "src/lib/chat/ownedChatDelete.ts")).href
);

const chatId = "anon_aaaa__anon_to__maria";
const now = 1_800_000_000_000;

cache.writeCachedChatMessages(chatId, [
  { id: "m1", text: "hola", createdAtMs: now - 60_000 },
  { id: "m2", text: "todo bien", createdAtMs: now - 30_000 },
]);
assert.equal(cache.readCachedChatMessages(chatId)?.length, 2);

deleted.rememberDeletedInboxChats([chatId], now);
cache.removeCachedChatMessages(chatId);
assert.equal(cache.readCachedChatMessages(chatId), null);
assert.equal(deleted.isMessageClearedByInboxDelete(chatId, now - 1), true);
assert.equal(deleted.isMessageClearedByInboxDelete(chatId, now + 1), false);

const hidden = deleted.withoutDeletedInboxChats([
  {
    id: chatId,
    canonicalChatId: chatId,
    lastMessage: "todo bien",
    updatedAt: { toMillis: () => now - 30_000 },
  },
]);
assert.equal(hidden.length, 0, "inbox hides the tombstoned thread");

const revived = deleted.withoutDeletedInboxChats([
  {
    id: chatId,
    canonicalChatId: chatId,
    lastMessage: "nuevo",
    updatedAt: { toMillis: () => now + 5_000 },
  },
]);
assert.equal(revived.length, 1, "a new send after delete may reappear in inbox");

const prev = [
  { id: "m1", text: "hola" },
  { id: "m2", text: "todo bien" },
];
const emptied = pages.mergeLiveWindowIntoHistory(prev, [], [], (loaded, pending) => [
  ...loaded,
  ...pending,
], { completeTail: true });
assert.deepEqual(emptied, [], "complete empty server tail replaces cached history");

const keptPage = pages.mergeLiveWindowIntoHistory(prev, [{ id: "m2" }], [], (loaded, pending) => [
  ...loaded,
  ...pending,
]);
assert.deepEqual(
  keptPage.map((row) => row.id),
  ["m1", "m2"],
  "incomplete live window still keeps older pages",
);

assert.equal(
  own.callerOwnsInboxChat({
    uid: "visitor",
    username: "alex",
    chatId,
    data: { receptorUid: "owner", targetUsername: "maria" },
  }),
  false,
);
assert.equal(
  own.callerCanDeleteInboxChat({
    uid: "visitor",
    username: "alex",
    chatId,
    data: { receptorUid: "owner", targetUsername: "maria" },
    leaseVisitorAuthUid: "visitor",
  }),
  true,
);

const deleteSrc = fs.readFileSync(path.join(root, "src/lib/chat/deleteChats.ts"), "utf8");
assert.match(deleteSrc, /removeCachedChatMessages/);
const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /isMessageClearedByInboxDelete/);
assert.match(chatSrc, /completeTail/);
const routeSrc = fs.readFileSync(
  path.join(root, "src/app/api/chat/delete-owned/route.ts"),
  "utf8",
);
assert.match(routeSrc, /callerCanDeleteInboxChat/);

console.log(JSON.stringify({ gate: "CHAT_DELETE_REOPEN", pass: true }));
