/**
 * FOLLOW + ANON MATCH REVIEW
 * Counts never go negative. Chat review reads ISO strings and Timestamp seconds.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const follow = await import(
  pathToFileURL(path.join(root, "src/lib/profile/followToggleCore.ts")).href
);
const review = await import(
  pathToFileURL(path.join(root, "src/lib/admin/anonMatchChatReview.ts")).href
);

assert.equal(follow.nextSocialCount(undefined, 1), 1);
assert.equal(follow.nextSocialCount(3, -1), 2);
assert.equal(follow.nextSocialCount(0, -1), 0);
assert.equal(follow.nextSocialCount("nope", 1), 1);
assert.equal(follow.nextSocialCount(2.8, 1), 3.8);

const iso = "2026-09-22T18:00:00.000Z";
assert.equal(review.firestoreTimeMs(iso), Date.parse(iso));
assert.equal(review.firestoreTimeMs({ seconds: 1_700_000_000 }), 1_700_000_000_000);
assert.equal(review.firestoreTimeMs({ toMillis: () => 42 }), 42);
assert.equal(review.firestoreTimeMs("1700000000000"), 1_700_000_000_000);
assert.equal(review.firestoreTimeMs(""), 0);
assert.equal(
  review.anonMatchActivityMs({ updatedAt: iso, createdAt: "2020-01-01T00:00:00.000Z" }),
  Date.parse(iso),
);
assert.equal(review.anonMatchMessageText({ texto: "hola", text: "otro" }), "hola");
assert.equal(review.anonMatchMessageText({ mensaje: "hola" }), "hola");
assert.equal(review.anonMatchMessageText({ text: "  desde text  " }), "desde text");

// Opening an anonymous match is not a conversation until there is a real send.
assert.equal(review.anonMatchHasMessages({ estado: "activo", ultimoMensaje: "", updatedAt: iso }), false);
assert.equal(review.anonMatchHasMessages({ estado: "cerrado", ultimoMensaje: "" }), false);
assert.equal(review.anonMatchHasMessages({ ultimoMensaje: "hola" }), true);
assert.equal(review.anonMatchHasMessages({ ultimoMensaje: "  ", lastMessage: "foto" }), true);
assert.equal(review.anonMatchHasMessages({ latestMessageId: "message-1" }), true);
assert.equal(review.anonMatchHasMessages({ lastMessageAt: iso }), true);
assert.equal(review.anonMatchHasMessages({ hasMessages: true }), true);
assert.equal(review.anonMatchHasMessages({ messagesCount: 1 }), true);

// A legacy fragment containing a sent message must survive collapse, even
// when a newer fragment of the same conversation is just an empty shell.
const row = (id, sourceDocId, updatedAtMs, hasMessages) => ({
  id, sourceDocIds: [sourceDocId], sourceCount: 1, tipo: "anon_con_anonimo",
  estado: "activo", solicitanteUid: "", destinatarioUid: "",
  solicitanteAnonId: "anon_a", destinatarioAnonId: "anon_b",
  ultimoMensaje: hasMessages ? "hola" : "", hasMessages,
  createdAtMs: 10, updatedAtMs,
});
const auditRows = review.collapseAnonMatchChatRows([
  row("same-chat", "legacy-with-message", 10, true),
  row("same-chat", "recent-empty-shell", 20, false),
  row("empty-only", "no-message", 30, false),
]).filter((chat) => chat.hasMessages === true);
assert.equal(auditRows.length, 1);
assert.equal(auditRows[0].id, "same-chat");
assert.equal(auditRows[0].sourceCount, 2);

console.log(JSON.stringify({ gate: "FOLLOW_AND_ANON_MATCH_REVIEW", pass: true }));
