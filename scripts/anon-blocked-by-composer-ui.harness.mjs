/**
 * ANON_BLOCKED_BY_COMPOSER_UI — platinum notice + locked composer, no red header alerts.
 *   node scripts/anon-blocked-by-composer-ui.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

assert.match(chatSrc, /composerLocked/);
assert.match(chatSrc, /profileBlockedByAnon/);
assert.match(chatSrc, /text-\[11px\] font-medium text-white\/30/);

const headerIdx = chatSrc.indexOf("<h1 className=\"truncate text-xl");
const headerSlice = chatSrc.slice(headerIdx, headerIdx + 1200);
assert.doesNotMatch(headerSlice, /profileBlockedByAnon \? \(/);
assert.doesNotMatch(headerSlice, /text-red-300.*chat_blocked_by_anon/);

assert.match(chatSrc, /disabled=\{composerLocked\}/);
assert.match(chatSrc, /if \(profileBlockedByAnon\) return/);
assert.doesNotMatch(chatSrc, /alert\(t\("chat_blocked_by_anon"\)\)/);

const abuseSrc = fs.readFileSync(
  path.join(root, "src/lib/abuse/anonProfileBlocks.ts"),
  "utf8",
);
assert.match(abuseSrc, /setAnonProfileBlock/);
assert.doesNotMatch(abuseSrc, /setDoc\(/);

console.log("PASS anon-blocked-by-composer-ui");
