import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(path.join(root, "functions/lib/viewOnceClaimCore.js")).href);
const base = { viewOnce: true, viewOnceLimit: 9, viewOnceOpenedCount: 0, fromUid: "sender" };
const decide = (message, secretMediaUrl = "") => core.decideViewOnceClaim({
  uid: "receiver", isMember: true, message, secretMediaUrl,
});
const pending = decide({ ...base, viewOnceSealed: false });
assert.equal(pending.ok, false);
assert.equal(pending.reason, "pending-seal");
assert.equal(pending.exhausted, false);
assert.equal(pending.openedCount, 0);
assert.equal(pending.remaining, 9);
const missing = decide({ ...base, viewOnceSealed: true });
assert.equal(missing.reason, "missing-media");
assert.equal(missing.exhausted, false);
const ready = decide({ ...base, viewOnceSealed: true }, "https://example.com/bomb.jpg");
assert.equal(ready.ok, true);
assert.equal(ready.openedCount, 1);
assert.equal(ready.remaining, 8);
for (const limit of [1, 2, 5, 6, 9, 99]) {
  const first = decide({ ...base, viewOnceLimit: limit, viewOnceSealed: true }, "https://example.com/bomb.jpg");
  assert.equal(first.ok, true);
  assert.equal(first.remaining, limit - 1);
  const final = decide({ ...base, viewOnceLimit: limit, viewOnceOpenedCount: limit - 1, viewOnceSealed: true }, "https://example.com/bomb.jpg");
  assert.equal(final.ok, true);
  assert.equal(final.exhausted, true);
  const exhausted = decide({ ...base, viewOnceLimit: limit, viewOnceOpenedCount: limit, viewOnceSealed: true }, "https://example.com/bomb.jpg");
  assert.equal(exhausted.reason, "exhausted");
}
const read = (p) => fs.readFileSync(path.join(root,p), "utf8");
const fn = read("functions/src/viewOnceClaim.ts");
assert.match(fn, /if \(decision\.reason === "exhausted"\)/);
assert.doesNotMatch(fn, /decision\.reason === "exhausted" \|\| decision\.reason === "missing-media"/);
assert.match(fn, /remaining: decision\.remaining/);
assert.match(fn, /exhausted: decision\.exhausted/);
const ui = read("src/components/chat/ProfileAnonChat.tsx");
assert.match(ui, /preparing = message\.viewOnceSealed === false/);
assert.match(ui, /data-chat-bomb-notice/);
assert.doesNotMatch(ui, /alert\(claimed\.exhausted/);
const mapper = read("src/lib/chat/profileAnonMessageAuthor.ts");
assert.match(mapper, /normalizeViewOnceLimit\(data\.viewOnceLimit\)/);
assert.doesNotMatch(mapper, /Math\.min\(5, Math\.floor\(Number\(data\.viewOnceLimit/);
const anon = read("src/components/anonMatch/AnonDirectChatWindow.tsx");
assert.match(anon, /Preparando bomba/);
console.log("VIEW_ONCE_PENDING_SEAL PASS: no premature exhaustion; 1-99 views; web and anon UI");
