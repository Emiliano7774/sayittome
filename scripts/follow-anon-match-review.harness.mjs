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

console.log(JSON.stringify({ gate: "FOLLOW_AND_ANON_MATCH_REVIEW", pass: true }));
