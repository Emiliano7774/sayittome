/**
 * CHAT_MEDIA_FAIL_TELEMETRY — static gate for sanitized fail diagnostics.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMediaSendFailure.ts")).href
);

const err = new failMod.ChatMediaSendError({
  stage: "batch_write",
  op: "writeBatch.commit",
  path: "chats/{chatId}+mensajes/{id}",
  code: "permission-denied",
});
const alert = failMod.formatChatMediaFailAlert("BASE", err);
assert.match(alert, /BASE/);
assert.match(alert, /\[batch_write\/writeBatch\.commit\/permission-denied\]/);
assert.doesNotMatch(alert, /https?:\/\//);
assert.doesNotMatch(alert, /Bearer/);
assert.equal(
  failMod.classifyChatMediaSendFailure(err).stage,
  "batch_write",
);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /CHAT_MEDIA_SEND_FAIL/);
assert.match(chatSrc, /formatChatMediaFailAlert/);
assert.match(chatSrc, /stage: "scan"/);
assert.match(chatSrc, /stage: "upload"/);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /stage: "batch_write"/);
assert.match(persistSrc, /stage: "view_once_commit"/);

console.log(JSON.stringify({ gate: "CHAT_MEDIA_FAIL_TELEMETRY", pass: true }, null, 2));
