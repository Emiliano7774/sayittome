/**
 * CHAT_MEDIA_SCAN_FAIL_DOES_NOT_BLOCK — local NSFW must soft-fail.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nsfw = fs.readFileSync(
  path.join(root, "src/lib/moderation/nsfwDetector.ts"),
  "utf8",
);
assert.match(nsfw, /function scanFailureFallback/);
assert.match(nsfw, /uncertain:\s*true/);
assert.match(nsfw, /export async function scanImageBlob/);
assert.match(nsfw, /nsfw blob scan failed/);
assert.match(nsfw, /return scanFailureFallback\(\)/);
assert.match(nsfw, /async function classifyElement/);
assert.match(nsfw, /nsfw classify failed/);

const scanMedia = fs.readFileSync(
  path.join(root, "src/lib/moderation/scanMedia.ts"),
  "utf8",
);
assert.match(scanMedia, /never throw/i);
assert.match(scanMedia, /SCAN_FAIL_PAYLOAD/);
assert.match(scanMedia, /uncertain:\s*true/);
assert.match(scanMedia, /scanUploadFile failed; continuing send/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /await scanUploadFile\(scanFile\)/);
assert.match(chatSrc, /uploadChatMessageMedia/);
assert.match(chatSrc, /persistAnonChatMessage/);
assert.doesNotMatch(
  chatSrc,
  /throw new ChatMediaSendError\(\s*\{\s*stage:\s*"scan"/,
);

console.log(
  JSON.stringify({ gate: "CHAT_MEDIA_SCAN_FAIL_DOES_NOT_BLOCK", pass: true }, null, 2),
);
