/**
 * Warm chat reopen first-frame: messages must hydrate synchronously from cache
 * in useState initializer (not only useEffect).
 *
 * Usage: node scripts/chat-thread-warm-first-frame.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

assert.match(
  src,
  /const \[messages, setMessages\] = useState<Message\[\]>\(\(\) =>/,
  "messages must initialize from a lazy useState factory",
);
assert.match(
  src,
  /useState<Message\[\]>\(\(\) =>[\s\S]*?readCachedChatMessages\(chatId\)/,
  "lazy factory must read chat message cache for first paint",
);
assert.match(
  src,
  /useState<Message\[\]>\(\(\) =>[\s\S]*?hydrateCachedMessages/,
  "lazy factory must hydrate cached rows into UI messages",
);

// Guard against regressing to empty-then-effect-only hydrate.
assert.doesNotMatch(
  src,
  /const \[messages, setMessages\] = useState<Message\[\]>\(\[\]\);/,
  "must not start the thread from an empty array when cache can paint",
);

const inboxSrc = fs.readFileSync(path.join(root, "src/hooks/useChatsInbox.ts"), "utf8");
assert.match(
  inboxSrc,
  /Cold auth settle|previousUid && previousUid !== uid/,
  "uid settle must not wipe warm inbox snapshot into []",
);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_THREAD_WARM_FIRST_FRAME",
      pass: true,
    },
    null,
    2,
  ),
);
