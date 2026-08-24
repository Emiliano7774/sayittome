/**
 * CHAT_MEDIA_SEND_NO_SILENT_DISCARD
 * Photo bomb / vertical video / audio must surface failures — no quiet returns.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

assert.match(chatSrc, /async function sendMedia\(\)/);
assert.match(chatSrc, /if \(!pendingBlob \|\| !pendingType\) \{\s*alert\(/);
assert.match(chatSrc, /viewOnce:\s*previewViewOnce/);
assert.match(chatSrc, /accept="video\/\*"/);
assert.match(chatSrc, /accept="image\/\*,video\/\*"/);
assert.match(chatSrc, /setMicNotice/);
assert.match(chatSrc, /chat_upload_fail|chat_save_fail|chat_upload_unauthorized/);

const media = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatMediaCapture.ts")).href
);
const vertical = media.fileFromChatInput(
  new File(["x"], "vertical.mp4", { type: "video/mp4" }),
  "gallery",
);
assert.equal(vertical?.type, "video");
assert.equal(vertical?.source, "gallery");

const bombPhoto = media.fileFromChatInput(
  new File(["x"], "bomb.jpg", { type: "image/jpeg" }),
  "camera",
);
assert.equal(bombPhoto?.type, "image");
assert.equal(bombPhoto?.source, "camera");

const captureSrc = fs.readFileSync(
  path.join(root, "src/lib/media/chatMediaCapture.ts"),
  "utf8",
);
assert.match(captureSrc, /code:\s*"chat_media_failed"/);
assert.match(
  captureSrc,
  /classifyChatMediaFailure\(error\) === "cancelled"[\s\S]{0,200}throw Object\.assign\([\s\S]{0,200}chat_media_failed/,
);

console.log(JSON.stringify({ gate: "CHAT_MEDIA_SEND_NO_SILENT_DISCARD", pass: true }, null, 2));
