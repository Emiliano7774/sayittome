/**
 * Chat warm cache must hit by chatId even when auth.currentUser is still null
 * (guest vs uid namespacing regression).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheSrc = fs.readFileSync(path.join(root, "src/lib/chat/chatMessageCache.ts"), "utf8");
const chatSrc = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const legacyChatSrc = fs.readFileSync(path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"), "utf8");
const storiesGroups = fs.readFileSync(path.join(root, "src/hooks/useStoriesGroups.ts"), "utf8");
const storiesStore = fs.readFileSync(path.join(root, "src/lib/stories/storiesIndexStore.ts"), "utf8");
const storiesSnap = fs.readFileSync(path.join(root, "src/lib/stories/storiesSnapshot.ts"), "utf8");
const logout = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");

assert.match(cacheSrc, /sayittome:chat-msgs:v3:/);
assert.match(cacheSrc, /Fall back to any v2 scoped/);
assert.doesNotMatch(cacheSrc, /resolveViewerKey/);
assert.match(chatSrc, /auth\.authStateReady\(\)/);
assert.match(chatSrc, /authReady && !isOwnerViewing && !chatSurfaceEngaged/);
assert.match(legacyChatSrc, /hydrateLegacyCachedMessages/);
assert.match(legacyChatSrc, /writeCachedChatMessages/);
assert.match(legacyChatSrc, /auth\.authStateReady\(\)/);
assert.match(legacyChatSrc, /viewerUid/);
assert.match(storiesSnap, /sayittome:stories-snapshot:v1/);
assert.match(storiesStore, /writeStoriesSnapshot/);
assert.match(storiesStore, /readStoriesSnapshot/);
assert.match(storiesStore, /clearStoriesIndexCache/);
assert.match(storiesGroups, /getCachedStoryGroups\(initialViewer\)/);
assert.match(logout, /clearStoriesIndexCache/);

console.log(JSON.stringify({ gate: "CHAT_STORIES_WARM_PAINT", pass: true }, null, 2));
