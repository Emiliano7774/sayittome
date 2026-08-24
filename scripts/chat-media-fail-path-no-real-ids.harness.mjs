/**
 * CHAT_MEDIA_FAIL_PATH_NO_REAL_IDS — diagnostics must use logical placeholders only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMediaSendFailure.ts")).href
);

const files = [
  "src/lib/chat/chatMediaSendFailure.ts",
  "src/lib/chat/persistAnonMessage.ts",
  "src/components/chat/ProfileAnonChat.tsx",
];

const BAD_PATH_INTERP = [
  /path:\s*`[^`]*\$\{(?:chatId|canonicalChatId|messageId|clientId)[^`]*`/,
  /path:\s*`[^`]*\$\{[^}]+\}[^`]*`/,
  /path:\s*["']chats\/(?!\{)[^"']{8,}["']/,
];

for (const rel of files) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const re of BAD_PATH_INTERP) {
    assert.equal(
      re.test(src),
      false,
      `${rel} must not interpolate real ids in fail path: ${re}`,
    );
  }
  assert.doesNotMatch(src, /path:\s*`chats\/\$\{/);
}

assert.equal(
  failMod.sanitizeFailPath("chats/AbCdEfGh12345678/mensajes/xyz"),
  "chats/{chatId}",
);
assert.equal(
  failMod.sanitizeFailPath("chats/canary_media_fail_1/{object}"),
  "chats/{chatId}",
);
assert.equal(
  failMod.sanitizeFailPath("chats/anon_abc__owner/mensajes/{id}"),
  "chats/{chatId}",
);
assert.equal(
  failMod.sanitizeFailPath("chats/{chatId}/{object}"),
  "chats/{chatId}/{object}",
);

const scrubbed = new failMod.ChatMediaSendError({
  stage: "persist",
  op: "writeBatch.commit",
  path: "chats/RealChatId999999/mensajes/msg1",
  code: "permission-denied",
});
assert.equal(scrubbed.path, "chats/{chatId}");
assert.doesNotMatch(failMod.formatChatMediaFailAlert("BASE", scrubbed), /RealChatId/);

console.log(
  JSON.stringify({ gate: "CHAT_MEDIA_FAIL_PATH_NO_REAL_IDS", pass: true }, null, 2),
);
