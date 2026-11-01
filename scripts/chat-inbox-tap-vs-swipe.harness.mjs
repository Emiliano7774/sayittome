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

assert.match(pointerDown, /warmCachedMessages\(\)/, "pointerdown warms only cache");
assert.doesNotMatch(pointerDown, /openChat\(|router\.prefetch|warmDesktopRoute/, "touch must neither navigate nor prefetch route");
assert.doesNotMatch(pointerDown, /presentChatThreadNow|fastRouterPush/);
assert.match(click, /event\.preventDefault\(\)/);
assert.match(click, /openChat\(/, "a completed click opens the chat");
assert.match(source, /if \(event\.pointerType !== "mouse"\) return;/, "mobile pointerenter must not prefetch route");
assert.match(source, /onFocus=\{warmCachedMessages\}/, "keyboard focus still warms cache");
assert.match(source, /const warmDesktopRoute =/, "desktop hover can prefetch");

console.log(JSON.stringify({ gate: "CHAT_INBOX_TAP_VS_SWIPE", pass: true }, null, 2));
