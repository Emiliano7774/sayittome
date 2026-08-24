/**
 * CHAT_MEDIA_FAIL_TELEMETRY — stages scan|upload|persist|secret|cleanup
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
  stage: "persist",
  op: "writeBatch.commit",
  path: "chats/{chatId}+mensajes/{id}",
  code: "permission-denied",
});
const alert = failMod.formatChatMediaFailAlert("BASE", err);
assert.match(alert, /BASE/);
assert.match(alert, /\[persist\/writeBatch\.commit\/permission-denied\]/);
assert.doesNotMatch(alert, /https?:\/\//);
assert.doesNotMatch(alert, /Bearer/);
assert.equal(failMod.classifyChatMediaSendFailure(err).stage, "persist");

const stages = ["scan", "upload", "persist", "secret", "cleanup"];
for (const stage of stages) {
  const e = new failMod.ChatMediaSendError({
    stage,
    op: "op",
    path: "p",
    code: "c",
  });
  assert.equal(failMod.classifyChatMediaSendFailure(e).stage, stage);
}

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /CHAT_MEDIA_SEND_FAIL/);
assert.match(chatSrc, /formatChatMediaFailAlert/);
assert.match(chatSrc, /stage: "upload"/);
assert.match(chatSrc, /stage: "cleanup"/);
assert.doesNotMatch(chatSrc, /stage: "scan"/);
assert.doesNotMatch(chatSrc, /throw new ChatMediaSendError\(\s*\{\s*stage: "scan"/);
assert.match(chatSrc, /Local NSFW must never abort send/);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /stage: "persist"/);
assert.match(persistSrc, /stage: "secret"/);
assert.match(persistSrc, /stage: "cleanup"/);
assert.doesNotMatch(persistSrc, /stage: "batch_write"/);
assert.doesNotMatch(persistSrc, /stage: "view_once_commit"/);

console.log(JSON.stringify({ gate: "CHAT_MEDIA_FAIL_TELEMETRY", pass: true }, null, 2));
