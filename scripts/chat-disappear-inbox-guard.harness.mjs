/**
 * Inbox shell + permit reuse guards.
 * Usage: node --experimental-strip-types scripts/chat-disappear-inbox-guard.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const guard = await import(pathToFileURL(path.join(root, "src/lib/chat/inboxShellGuard.ts")).href);
const permit = await import(pathToFileURL(path.join(root, "src/lib/abuse/permitReuse.ts")).href);
const pending = await import(pathToFileURL(path.join(root, "src/lib/chat/pendingChatSends.ts")).href);
const session = await import(pathToFileURL(path.join(root, "src/lib/chat/sessionChats.ts")).href);

const visible = { lastMessage: "hola", updatedAt: { toMillis: () => 10 }, latestMessageId: "m1" };
const emptyNewer = { lastMessage: "", updatedAt: { toMillis: () => 99 } };
const visibleNewer = { lastMessage: "chau", updatedAt: { toMillis: () => 20 }, latestMessageId: "m2" };

assert.equal(guard.preferInboxChat(visible, emptyNewer), visible, "empty must not replace visible");
assert.equal(guard.preferInboxChat(emptyNewer, visible).lastMessage, "hola", "visible replaces empty");
assert.equal(guard.preferInboxChat(visible, visibleNewer).lastMessage, "chau", "newer visible wins");

const now = 1_000_000;
assert.equal(guard.shouldIncludeRecoveredChat({ lastMessage: "hola", nowMs: now }), true);
assert.equal(
  guard.shouldIncludeRecoveredChat({ lastMessage: "", createdAtMs: now - 1000, nowMs: now }),
  true,
  "fresh empty shell stays recoverable",
);
assert.equal(
  guard.shouldIncludeRecoveredChat({ lastMessage: "", createdAtMs: now - 120_000, nowMs: now }),
  false,
  "abandoned empty shell is dropped",
);
assert.equal(
  guard.shouldRetryMissingPreview({
    attempts: 1,
    createdAtMs: now - 1000,
    nowMs: now,
    chatId: "c",
  }),
  true,
);
assert.equal(
  guard.shouldRetryMissingPreview({
    attempts: 1,
    createdAtMs: now - 120_000,
    nowMs: now,
    chatId: "c",
  }),
  false,
);

assert.equal(
  permit.decideExistingPermitReuse(
    { visitorAuthUid: "u", chatId: "c", messageId: "m", expiresAtMs: now + 1000 },
    { visitorAuthUid: "u", chatId: "c", messageId: "m" },
    now,
  ),
  "accept",
);
assert.equal(
  permit.decideExistingPermitReuse(
    { visitorAuthUid: "other", chatId: "c", messageId: "m", expiresAtMs: now + 1000 },
    { visitorAuthUid: "u", chatId: "c", messageId: "m" },
    now,
  ),
  "reject",
);

pending.rememberPendingChatSend({ chatId: "chat-a", clientId: "c1" });
assert.deepEqual(pending.listPendingChatSendIds(), ["chat-a"]);
window.sessionStorage.clear();
assert.deepEqual(pending.listPendingChatSendIds(), ["chat-a"], "localStorage survives session wipe");
pending.forgetPendingChatSend({ chatId: "chat-a", clientId: "c1" });
assert.deepEqual(pending.listPendingChatSendIds(), []);

for (let i = 1; i <= 100; i += 1) session.registerSessionChat(`chat-${i}`);
const ids = session.getSessionChatIds();
assert.equal(ids.length, 100);
assert.ok(ids.includes("chat-1"));
assert.ok(ids.includes("chat-40"));
assert.ok(ids.includes("chat-41"));
assert.ok(ids.includes("chat-100"));

console.log("chat-disappear-inbox-guard PASS");
