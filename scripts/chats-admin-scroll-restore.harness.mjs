/**
 * CHATS_ADMIN_SCROLL_RESTORE
 * Exact inbox/admin history list restoration after leaving a thread.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const chatsStoreSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/chatsListScrollStore.ts"),
  "utf8",
);
const adminStoreSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/adminHistoryListScrollStore.ts"),
  "utf8",
);
const inboxLinkSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ChatInboxLink.tsx"),
  "utf8",
);
const adminListSrc = fs.readFileSync(
  path.join(root, "src/components/admin/review/AdminChatHistoryList.tsx"),
  "utf8",
);

assert.match(chatsStoreSrc, /captureChatsListScroll/);
assert.match(chatsStoreSrc, /restoreChatsListScroll/);
assert.match(chatsStoreSrc, /consumeChatsListScroll/);
assert.match(adminStoreSrc, /captureAdminHistoryListScroll/);
assert.match(adminStoreSrc, /restoreAdminHistoryListScroll/);
assert.match(inboxLinkSrc, /captureChatsListScroll/);
assert.match(adminListSrc, /captureAdminHistoryListScroll|restoreAdminHistoryListScroll/);

const chats = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/chatsListScrollStore.ts")).href
);
const admin = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/adminHistoryListScrollStore.ts")).href
);

const rows = new Map([
  ["chat-a", { getAttribute: (k) => (k === "data-chat-id" ? "chat-a" : null), getBoundingClientRect: () => ({ top: 400 }), scrollIntoView() {} }],
  ["chat-b", { getAttribute: (k) => (k === "data-chat-id" ? "chat-b" : null), getBoundingClientRect: () => ({ top: 900 }), scrollIntoView() {} }],
]);
document.querySelectorAll = (selector) => {
  if (String(selector).includes("data-nav-chat-row")) {
    return [...rows.values()];
  }
  return [];
};
Object.defineProperty(window, "scrollY", { value: 640, configurable: true, writable: true });
window.scrollTo = (x, y) => {
  const top = typeof x === "object" ? Number(x.top) || 0 : Number(y) || 0;
  Object.defineProperty(window, "scrollY", { value: top, configurable: true, writable: true });
};

chats.captureChatsListScroll("chat-b");
const peeked = chats.peekChatsListScroll();
assert.equal(peeked.chatId, "chat-b");
assert.equal(peeked.scrollY, 640);

const restored = chats.restoreChatsListScroll();
assert.equal(restored, true);
assert.equal(chats.peekChatsListScroll(), null);

admin.captureAdminHistoryListScroll({
  username: "Alice",
  scrollTop: 333,
  selectedChatId: "thread-9",
});
const scroller = { scrollTop: 0 };
assert.equal(admin.restoreAdminHistoryListScroll(scroller, "alice"), true);
assert.equal(scroller.scrollTop, 333);
assert.equal(admin.peekAdminHistoryListScroll("ALICE").selectedChatId, "thread-9");

console.log(JSON.stringify({ gate: "CHATS_ADMIN_SCROLL_RESTORE", pass: true }, null, 2));
