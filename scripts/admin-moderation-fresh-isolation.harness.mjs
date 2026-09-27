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

const collapsed = review.collapseAnonMatchChatRows([
  {
    id: "session-1",
    sourceDocIds: ["fragment-a"],
    sourceCount: 1,
    tipo: "perfil_con_anonimo",
    estado: "activo",
    solicitanteUid: "profile-1",
    destinatarioUid: "",
    solicitanteAnonId: "",
    destinatarioAnonId: "anon-1",
    ultimoMensaje: "primero",
    createdAtMs: 10,
    updatedAtMs: 20,
  },
  {
    id: "session-1",
    sourceDocIds: ["fragment-b"],
    sourceCount: 1,
    tipo: "perfil_con_anonimo",
    estado: "cerrado",
    solicitanteUid: "profile-1",
    destinatarioUid: "",
    solicitanteAnonId: "",
    destinatarioAnonId: "anon-1",
    ultimoMensaje: "último",
    createdAtMs: 12,
    updatedAtMs: 30,
  },
  {
    id: "session-2",
    sourceDocIds: ["fragment-c"],
    sourceCount: 1,
    tipo: "anonimo_con_anonimo",
    estado: "activo",
    solicitanteUid: "",
    destinatarioUid: "",
    solicitanteAnonId: "anon-2",
    destinatarioAnonId: "anon-3",
    ultimoMensaje: "otra conversación",
    createdAtMs: 40,
    updatedAtMs: 50,
  },
]);
assert.equal(collapsed.length, 2);
assert.equal(collapsed[0].id, "session-2");
assert.equal(collapsed[1].sourceCount, 2);
assert.equal(collapsed[1].ultimoMensaje, "último");
assert.equal(
  review.anonMatchInteractionId("fragment-a", { chatId: "session-1" }),
  "session-1",
);

const route = fs.readFileSync(path.join(root, "src/app/api/admin/anon-match-chats/route.ts"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/components/admin/spectator/AdminAnonMatchChatsPanel.tsx"), "utf8");
const feed = fs.readFileSync(path.join(root, "src/hooks/useClassicModerationFeed.ts"), "utf8");

assert.match(route, /collection\("chats_anonimos"\)\.get\(\)/);
assert.doesNotMatch(route, /orderBy\("createdAt", "desc"\)\.limit\(250\)/);
assert.match(route, /selectAnonMatchMessageRows/);
assert.match(route, /collapseAnonMatchChatRows/);
assert.match(route, /interactionDocs/);
assert.doesNotMatch(route, /batches\s*\.flat\(\)/);
assert.match(panel, /grid-cols-\[minmax\(280px,0\.8fr\)_minmax\(380px,1\.2fr\)\]/);
assert.match(panel, /Conversación temporal/);
assert.match(panel, /setInterval\(refresh, 10_000\)/);
assert.match(panel, /setInterval\(\(\) => void loadDetail\(true\), 5_000\)/);
assert.match(feed, /setInterval\(refresh, 10_000\)/);
assert.match(feed, /visibilitychange/);

console.log(JSON.stringify({ gate: "ADMIN_MODERATION_FRESH_ISOLATION", pass: true }, null, 2));
