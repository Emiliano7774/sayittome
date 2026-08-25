/**
 * FCM_EXPANDABLE_UNREAD
 * Per-chat expandable notification carries ALL unread lines (chrono, last bottom).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const fnSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnSrc, /collapseKey:\s*`chat-\$\{chatId\}`/);
assert.match(fnSrc, /unreadLines/);
assert.match(fnSrc, /encodeUnreadLinesForFcm/);
assert.match(fnSrc, /loadUnreadLinesForPush/);
assert.doesNotMatch(fnSrc, /collapseKey:\s*`msg-\$\{messageId\}`/);
// Data-only: no android.notification block that would OS-replace the last line only.
assert.doesNotMatch(
  fnSrc.slice(fnSrc.indexOf("const multicast"), fnSrc.indexOf("sendEachForMulticast")),
  /notification:\s*\{\s*channelId/,
);

const native = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/ChatExpandableMessagingService.java"),
  "utf8",
);
assert.match(native, /MessagingStyle/);
assert.match(native, /unreadLines/);
assert.match(native, /google\.message_id/);

const manifest = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
assert.match(manifest, /ChatExpandableMessagingService/);
assert.match(manifest, /MessagingService"[\s\S]*tools:node="remove"/);

let selectUnreadNotificationLines;
let encodeUnreadLinesForFcm;
let formatCollapsedUnreadBody;
const compiled = path.join(root, "functions/lib/unreadNotificationLines.js");
if (fs.existsSync(compiled)) {
  const mod = require(compiled);
  selectUnreadNotificationLines = mod.selectUnreadNotificationLines;
  encodeUnreadLinesForFcm = mod.encodeUnreadLinesForFcm;
  formatCollapsedUnreadBody = mod.formatCollapsedUnreadBody;
} else {
  const mod = await import(
    pathToFileURL(path.join(root, "functions/src/unreadNotificationLines.ts")).href
  );
  selectUnreadNotificationLines = mod.selectUnreadNotificationLines;
  encodeUnreadLinesForFcm = mod.encodeUnreadLinesForFcm;
  formatCollapsedUnreadBody = mod.formatCollapsedUnreadBody;
}

const lines = selectUnreadNotificationLines({
  messages: [
    { id: "1", texto: "primero", fromUid: "anon_x", createdAtMs: 100, readBy: {} },
    { id: "2", texto: "segundo", fromUid: "anon_x", createdAtMs: 200, readBy: {} },
    { id: "3", texto: "mio", fromUid: "owner", createdAtMs: 150, readBy: { owner: true } },
    { id: "4", texto: "ya leido", fromUid: "anon_x", createdAtMs: 50, readBy: { owner: true } },
  ],
  recipientUid: "owner",
  titleForMessage: () => "Anon-x",
  limit: 20,
});
assert.deepEqual(
  lines.map((row) => row.t),
  ["primero", "segundo"],
);
assert.equal(lines[lines.length - 1].t, "segundo");
assert.match(encodeUnreadLinesForFcm(lines), /primero/);
assert.equal(formatCollapsedUnreadBody(lines), "primero\nsegundo");

const readSrc = fs.readFileSync(path.join(root, "scripts/push-chat-read-persist.harness.mjs"), "utf8");
assert.match(readSrc, /PUSH_CHAT_READ_PERSIST|resolveDetailReadMark/);

console.log(JSON.stringify({ gate: "FCM_EXPANDABLE_UNREAD", pass: true }, null, 2));
