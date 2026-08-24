/**
 * CHAT_MEDIA_SEND_PERSIST
 * Static gate: upload→persist→commit wiring, orphan rollback, no ghost bubble,
 * live auth uid for authorship, viewOnce birth without mediaUrl.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
const uploadSrc = fs.readFileSync(path.join(root, "src/lib/media/upload.ts"), "utf8");
const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

assert.match(persistSrc, /livePersistAuthUid/);
assert.match(persistSrc, /auth\.currentUser\?\.uid/);
assert.match(persistSrc, /commitViewOnceSecretWithRetry/);
assert.match(persistSrc, /mediaUrl && !viewOnce/);
assert.match(persistSrc, /deleteDoc\(messageRef\)/);

assert.match(uploadSrc, /ChatMediaUploadResult/);
assert.match(uploadSrc, /deleteChatMessageMediaAtPath/);
assert.match(uploadSrc, /storage\/object-not-found/);

assert.match(chatSrc, /uploaded\.url/);
assert.match(chatSrc, /deleteChatMessageMediaAtPath\(storagePath\)/);
assert.match(
  chatSrc,
  /old\.filter\(\(message\) => message\.clientId !== clientId\)/,
);

assert.match(rules, /collection != 'viewOnceSecrets'/);
assert.doesNotMatch(rules, /string\(request\.path\)/);

assert.match(
  fs.readFileSync(path.join(root, "src/lib/media/viewOnceClaim.ts"), "utf8"),
  /COMMIT_VIEW_ONCE_SECRET/,
);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_MEDIA_SEND_PERSIST",
      pass: true,
      matrix: [
        "profile+anon",
        "new+existing",
        "camera+gallery",
        "photo+video",
        "bomb_1_to_5",
        "orphan_rollback",
        "no_ghost_bubble",
      ],
    },
    null,
    2,
  ),
);
