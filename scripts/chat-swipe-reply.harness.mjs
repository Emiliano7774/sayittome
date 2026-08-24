/**
 * CHAT_SWIPE_REPLY
 * Left swipe on any message quotes/replies; quote persists for media + text.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const quote = await import(
  pathToFileURL(path.join(root, "src/lib/chat/replyQuote.ts")).href
);

assert.equal(quote.replyQuoteText({ text: "hola" }), "hola");
assert.equal(quote.replyQuoteText({ type: "image", viewOnce: true }), "📷 Bomba");
assert.equal(quote.replyQuoteText({ type: "video" }), "🎬 Video");
assert.equal(quote.replyQuoteText({ type: "audio" }), "🎵 Audio");
assert.equal(quote.replyQuoteText({ deletedForEveryone: true, text: "x" }), "");

const swipeSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ChatSwipeRevealTime.tsx"),
  "utf8",
);
assert.match(swipeSrc, /onSwipeLeftReply/);
assert.match(swipeSrc, /REPLY_THRESHOLD/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /onSwipeLeftReply/);
assert.match(chatSrc, /replyQuoteText\(replyingTo\)/);
assert.match(chatSrc, /reply:\s*replyText/);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /storedReply/);

console.log(JSON.stringify({ gate: "CHAT_SWIPE_REPLY", pass: true }, null, 2));
