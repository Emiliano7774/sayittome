/**
 * Inbox rows may warm on pointerdown, but navigation must wait for a real click.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "src/components/chats/ChatInboxLink.tsx"),
  "utf8",
);

const pointerDown =
  source.match(/onPointerDown=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/)?.[1] || "";
const click = source.match(/onClick=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/)?.[1] || "";

assert.match(pointerDown, /warmThread\(\)/, "pointerdown should only warm the thread");
assert.doesNotMatch(pointerDown, /openChat\(/, "pointerdown must never navigate");
assert.doesNotMatch(pointerDown, /presentChatThreadNow|fastRouterPush/);
assert.match(click, /event\.preventDefault\(\)/);
assert.match(click, /openChat\(/, "a completed click opens the chat");
assert.match(source, /onPointerEnter=\{warmThread\}/);

console.log(JSON.stringify({ gate: "CHAT_INBOX_TAP_VS_SWIPE", pass: true }, null, 2));
