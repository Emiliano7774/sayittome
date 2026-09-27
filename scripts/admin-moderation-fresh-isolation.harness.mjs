/** ADMIN_MODERATION_FRESH_ISOLATION */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const review = await import(
  pathToFileURL(path.join(root, "src/lib/admin/anonMatchChatReview.ts")).href
);

const canonical = review.selectAnonMatchMessageRows({
  mensajes: [
    { id: "m2", collectionName: "mensajes", text: "nuevo 2", senderId: "a", senderTipo: "anonimo", type: "text", createdAtMs: 20 },
    { id: "m1", collectionName: "mensajes", text: "nuevo 1", senderId: "b", senderTipo: "perfil", type: "text", createdAtMs: 10 },
  ],
  messages: [
    { id: "legacy", collectionName: "messages", text: "no mezclar", senderId: "x", senderTipo: "", type: "text", createdAtMs: 5 },
  ],
});
assert.deepEqual(canonical.map((row) => row.id), ["m1", "m2"]);

const legacyFallback = review.selectAnonMatchMessageRows({
  mensajes: [],
  messages: [
    { id: "legacy", collectionName: "messages", text: "legado", senderId: "x", senderTipo: "", type: "text", createdAtMs: 5 },
  ],
});
assert.deepEqual(legacyFallback.map((row) => row.id), ["legacy"]);

const route = fs.readFileSync(path.join(root, "src/app/api/admin/anon-match-chats/route.ts"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/components/admin/spectator/AdminAnonMatchChatsPanel.tsx"), "utf8");
const feed = fs.readFileSync(path.join(root, "src/hooks/useClassicModerationFeed.ts"), "utf8");

assert.match(route, /collection\("chats_anonimos"\)\.get\(\)/);
assert.doesNotMatch(route, /orderBy\("createdAt", "desc"\)\.limit\(250\)/);
assert.match(route, /selectAnonMatchMessageRows/);
assert.doesNotMatch(route, /batches\s*\.flat\(\)/);
assert.match(panel, /setInterval\(refresh, 10_000\)/);
assert.match(panel, /setInterval\(\(\) => void loadDetail\(true\), 5_000\)/);
assert.match(feed, /setInterval\(refresh, 10_000\)/);
assert.match(feed, /visibilitychange/);

console.log(JSON.stringify({ gate: "ADMIN_MODERATION_FRESH_ISOLATION", pass: true }, null, 2));
