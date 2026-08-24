/**
 * CHAT_NOTIFICATION_UNIQUE_IDS
 * Unseen chat banners must stack (messageId tag/id) and keep a chat inbox group.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const fnSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnSrc, /collapseKey:\s*`msg-\$\{messageId\}`/);
assert.match(fnSrc, /tag:\s*`msg-\$\{messageId\}`/);
assert.doesNotMatch(fnSrc, /collapseKey:\s*`chat-\$\{chatId\}`/);
assert.doesNotMatch(fnSrc, /tag:\s*`chat-\$\{chatId\}`/);
assert.match(fnSrc, /group:\s*`chat-\$\{chatId\}`/);

const notif = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatNotifications.ts")).href
);

const a = notif.stableNotificationId("msg-aaa");
const b = notif.stableNotificationId("msg-bbb");
assert.notEqual(a, b);
assert.equal(notif.stableNotificationId("msg-aaa"), a);

assert.equal(
  notif.chatNotificationTag({ chatId: "c1", messageId: "m1" }),
  "sayittome-msg-m1",
);
assert.equal(notif.chatNotificationTag({ chatId: "c1" }), "sayittome-chat-c1");

const whip = fs.readFileSync(
  path.join(root, "src/lib/chat/globalChatWhipManager.ts"),
  "utf8",
);
assert.match(whip, /messageId,/);

console.log(JSON.stringify({ gate: "CHAT_NOTIFICATION_UNIQUE_IDS", pass: true }, null, 2));
