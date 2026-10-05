/**
 * Express anon chat stays pinned to the latest message and does not scroll the page.
 *   node scripts/anon-direct-chat-scroll.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scroll = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectChatScroll.ts")).href
);

const scroller = {
  scrollTop: 0,
  scrollHeight: 480,
};
scroll.pinAnonChatScroll(scroller);
assert.equal(scroller.scrollTop, 480);
scroll.pinAnonChatScroll(null);

const src = fs.readFileSync(
  path.join(root, "src/components/anonMatch/AnonDirectChatWindow.tsx"),
  "utf8",
);
assert.match(src, /pinAnonChatScroll/);
assert.match(src, /readKeyboardOverlapPx/);
assert.match(src, /data-anon-direct-chat-scroll/);
assert.doesNotMatch(src, /scrollIntoView/);

console.log("PASS anon-direct-chat-scroll");
