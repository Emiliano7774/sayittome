/**
 * Logout / fresh-anon must drop the registered profile inbox locally.
 *   node scripts/logout-inbox-isolation.harness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const logout = read("src/lib/auth/logout.ts");
const reset = read("src/lib/chat/inboxIdentityReset.ts");
const snapshot = read("src/lib/chat/inboxSnapshot.ts");
const merge = read("src/lib/chat/inboxPeerTitle.ts");
const hook = read("src/hooks/useChatsInbox.ts");
const anonSession = read("src/lib/chat/anonSession.ts");

assert.match(logout, /resetInboxForIdentityChange/);
assert.match(reset, /clearInboxSnapshotCache/);
assert.match(reset, /clearSessionChats/);
assert.match(reset, /clearCachedChatMessages/);
assert.match(reset, /INBOX_IDENTITY_RESET_EVENT/);
assert.match(snapshot, /if \(chats\.length === 0\) \{\s*clearInboxSnapshotCache\(\);/);
assert.match(merge, /liveAnonId = ""/);
assert.match(merge, /profileAnonSenderFromChat\(chat\) === liveAnon/);
assert.match(hook, /INBOX_IDENTITY_RESET_EVENT/);
assert.match(hook, /anonSessionId/);
assert.match(anonSession, /resetInboxForIdentityChange/);

console.log("logout-inbox-isolation: ok");
