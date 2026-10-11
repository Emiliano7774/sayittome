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

// Regression: visitor's own anon_* lines have no public senderAuthUid by design.
// A new profile reply must display ONLY the profile's lines, not the visitor's.
const anonymousVisitorLines = selectUnreadNotificationLines({
  messages: [
    { id: "a1", texto: "mi mensaje", fromUid: "anon_visitA", createdAtMs: 100 },
    { id: "p1", texto: "respuesta recibida", fromUid: "profile_owner", createdAtMs: 200 },
    { id: "a2", texto: "mi mensaje tras rotación", fromUid: "anon_visitB", createdAtMs: 300 },
    { id: "p2", texto: "otra respuesta", fromUid: "profile_owner", createdAtMs: 400 },
  ],
  recipientUid: "visitorAuth",
  ownSenderAliases: ["anon_visitA", "anon_visitB"],
  titleForMessage: () => "Anónimo",
});
assert.deepEqual(
  anonymousVisitorLines.map((row) => row.t),
  ["respuesta recibida", "otra respuesta"],
  "visitor must not see their own anonymous outbound messages in an expandable notification",
);
const ownerLines = selectUnreadNotificationLines({
  messages: [
    { id: "a1", texto: "hola de anon", fromUid: "anon_visitA", createdAtMs: 100 },
    { id: "p1", texto: "mi respuesta", fromUid: "profile_owner", createdAtMs: 200 },
  ],
  recipientUid: "owner",
  ownSenderAliases: [],
  titleForMessage: () => "Anon",
});
assert.deepEqual(ownerLines.map((row) => row.t), ["hola de anon"],
  "profile owner must still receive the visitor's inbound anonymous messages");

const readSrc = fs.readFileSync(path.join(root, "scripts/push-chat-read-persist.harness.mjs"), "utf8");
assert.match(readSrc, /PUSH_CHAT_READ_PERSIST|resolveDetailReadMark/);

console.log(JSON.stringify({ gate: "FCM_EXPANDABLE_UNREAD", pass: true }, null, 2));
