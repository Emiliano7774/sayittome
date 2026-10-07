/**
 * CHAT_PENDING_TICK_CLEAR — orange Shuffle latch clears on read / mark-all.
 *   node --experimental-strip-types scripts/chat-pending-tick-clear.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pending = await import(
  pathToFileURL(path.join(root, "src/lib/chat/localPendingChats.ts")).href
);

const alertsSrc = fs.readFileSync(
  path.join(root, "src/hooks/useGlobalChatAlerts.ts"),
  "utf8",
);
const unreadSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/unread.ts"),
  "utf8",
);

pending.markLocalPendingChat("thread_a");
pending.markLocalPendingChat("thread_b");
assert.equal(pending.countLocalPendingChats(), 2);

pending.clearLocalPendingChatsForThread("thread_a", "alias_a");
assert.equal(pending.countLocalPendingChats(), 1);
assert.deepEqual(pending.getLocalPendingChatIds(), ["thread_b"]);

pending.clearAllLocalPendingChats();
assert.equal(pending.countLocalPendingChats(), 0);

pending.markLocalPendingChat("canonical_x");
assert.equal(
  pending.countLocalPendingChats("url_x", "canonical_x"),
  0,
  "open-thread aliases must exclude latch from badge count",
);

pending.markLocalPendingChat("stale_latched");
pending.reconcileLocalPendingChats(() => false, Date.now(), 0);
assert.equal(
  pending.countLocalPendingChats(),
  0,
  "reconcile clears read chats after grace",
);

pending.markLocalPendingChat("fresh_whip");
pending.reconcileLocalPendingChats(() => false, Date.now(), 2500);
assert.equal(
  pending.countLocalPendingChats(),
  1,
  "grace window keeps whip paint before inbox catches up",
);
pending.clearAllLocalPendingChats();

assert.match(unreadSrc, /clearLocalPendingChatsForThread/);
assert.match(unreadSrc, /clearAllLocalPendingChats/);
assert.match(alertsSrc, /reconcileLocalPendingChats/);
assert.match(alertsSrc, /clearLocalPendingChatsForThread/);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_PENDING_TICK_CLEAR",
      pass: true,
      checks: [
        "clear-for-thread",
        "clear-all",
        "alias-exclude-count",
        "reconcile-after-grace",
        "grace-keeps-fresh-whip",
        "wired-mark-read-and-alerts",
      ],
    },
    null,
    2,
  ),
);
