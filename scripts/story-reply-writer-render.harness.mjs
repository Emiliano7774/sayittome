/**
 * Story reply writer + both-side render + reopen.
 * Usage: node --experimental-strip-types scripts/story-reply-writer-render.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const snapshot = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyReplySnapshot.ts")).href
);
const author = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);
const fs = await import("node:fs");
const persistSource = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
const storyReplySendSource = fs.readFileSync(
  path.join(root, "src/lib/stories/sendStoryReply.ts"),
  "utf8",
);
const commitIndex = persistSource.indexOf("await commitWithStoryReplyRulesFallback");
const sessionRegistrationIndex = persistSource.indexOf(
  "registerSessionChat(effectiveChatId)",
);
assert.ok(commitIndex >= 0, "story reply must use the atomic commit path");
assert.ok(
  sessionRegistrationIndex > commitIndex,
  "session inbox registration must happen after the chat commit",
);
assert.match(
  storyReplySendSource,
  /return persisted\.canonicalChatId \|\| resolved\.chatId/,
  "story reply must return the committed canonical chat id",
);

const story = {
  id: "story_1",
  mediaUrl: "https://example.test/story.jpg",
  mediaType: "image",
  ownerUsername: "maria",
};
const payload = snapshot.buildStoryReplyPayload(story, "maria");
assert.equal(payload.storyId, "story_1");
assert.equal(payload.ownerUsername, "maria");

const encoded = snapshot.encodeStoryReplySnapshot(payload);
assert.equal(encoded.startsWith(snapshot.STORY_REPLY_PREFIX), true);
assert.deepEqual(snapshot.decodeStoryReplySnapshot(encoded), payload);
assert.deepEqual(snapshot.decodeStoryReplySnapshot(payload), payload);

const nestedCard = snapshot.resolveStoryReplyCard({
  storyReply: payload,
  reply: encoded,
});
assert.equal(nestedCard?.snapshot.storyId, "story_1");
assert.equal(nestedCard?.quote, undefined);

const fallbackCard = snapshot.resolveStoryReplyCard({
  reply: encoded,
});
assert.equal(fallbackCard?.snapshot.mediaUrl, story.mediaUrl);

const expiredCard = snapshot.resolveStoryReplyCard({
  storyReply: { storyId: "story_1", ownerUsername: "maria", mediaType: "image" },
});
assert.equal(expiredCard?.snapshot.mediaUrl, undefined);

const chatId = "anon_visitor__anon_to__maria";
const visitorFrom = "anon_visitor";
const ownerUid = "owner_uid_1";
const firestoreDoc = {
  texto: "hola historia",
  text: "hola historia",
  fromUid: visitorFrom,
  senderKind: "anon",
  senderRole: "anon",
  senderAuthUid: "",
  storyReply: payload,
  reply: encoded,
};

const visitorCtx = author.buildProfileAnonViewerContext({
  chatId,
  chatAnonSessionId: visitorFrom,
  currentUid: "",
  targetUid: ownerUid,
  chatOwnerUid: ownerUid,
  identityReady: true,
  authReady: true,
  liveAnonId: visitorFrom,
});
const ownerCtx = author.buildProfileAnonViewerContext({
  chatId,
  chatAnonSessionId: visitorFrom,
  currentUid: ownerUid,
  targetUid: ownerUid,
  chatOwnerUid: ownerUid,
  viewerUsername: "maria",
  identityReady: true,
  authReady: true,
  liveAnonId: "anon_owner_browser",
});

const visitorRows = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: "m1", data: firestoreDoc }],
  visitorCtx,
);
const ownerRows = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: "m1", data: firestoreDoc }],
  ownerCtx,
);

assert.equal(visitorRows[0].mine, true);
assert.equal(ownerRows[0].mine, false);
assert.equal(visitorRows[0].storyReply?.storyId, "story_1");
assert.equal(ownerRows[0].storyReply?.ownerUsername, "maria");
assert.equal(visitorRows[0].text, "hola historia");
assert.equal(ownerRows[0].text, "hola historia");

const encodedOnly = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: "m2", data: { ...firestoreDoc, storyReply: undefined, reply: encoded } }],
  visitorCtx,
);
assert.equal(encodedOnly[0].storyReply?.storyId, "story_1");
assert.equal(encodedOnly[0].reply, undefined);

const cached = cache.uiMessageToCached(visitorRows[0]);
const reopened = cache.cachedMessageToUi(cached);
assert.equal(reopened.storyReply?.storyId, "story_1");
assert.equal(reopened.mine, true);
assert.equal(reopened.text, "hola historia");

assert.equal(
  snapshot.storyReplyLastMessagePreview("hola historia", "maria"),
  "hola historia · @maria",
);

const persistPatch = snapshot.buildStoryReplyPersistPatch({
  messageText: "hola historia",
  storyReply: payload,
});
assert.equal(persistPatch.storyReply?.storyId, "story_1");
assert.equal(persistPatch.storedReply.startsWith(snapshot.STORY_REPLY_PREFIX), true);
assert.equal(persistPatch.lastMessagePreview, "hola historia · @maria");

const nestedWrite = {
  texto: "hola historia",
  text: "hola historia",
  fromUid: visitorFrom,
  reply: persistPatch.storedReply,
  storyReply: persistPatch.storyReply,
};
const fallbackWrite = snapshot.omitNestedStoryReplyField(nestedWrite);
assert.equal("storyReply" in fallbackWrite, false);
assert.equal(fallbackWrite.reply.startsWith(snapshot.STORY_REPLY_PREFIX), true);

assert.equal(
  snapshot.isFirestorePermissionDenied({
    code: "permission-denied",
    message: "Missing or insufficient permissions.",
  }),
  true,
);

const fallbackRowsVisitor = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: "m3", data: fallbackWrite }],
  visitorCtx,
);
const fallbackRowsOwner = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: "m3", data: fallbackWrite }],
  ownerCtx,
);
assert.equal(fallbackRowsVisitor[0].mine, true);
assert.equal(fallbackRowsOwner[0].mine, false);
assert.equal(fallbackRowsVisitor[0].storyReply?.storyId, "story_1");
assert.equal(fallbackRowsOwner[0].storyReply?.storyId, "story_1");

const persistWrites = [];
const denied = Object.assign(new Error("Missing or insufficient permissions."), {
  code: "permission-denied",
});
const commitOnce = async (next) => {
  persistWrites.push({ ...next });
  if (next.storyReply) throw denied;
};
const messageId = "m_story_1";
const persistResult = await snapshot.commitWithStoryReplyRulesFallback(
  { id: messageId, ...nestedWrite },
  commitOnce,
);
assert.equal(persistWrites.length, 2);
assert.equal(persistResult.attempts, 2);
assert.equal(persistResult.retriedWithoutNestedMap, true);
assert.equal("storyReply" in persistWrites[0], true);
assert.equal("storyReply" in persistWrites[1], false);
assert.equal(persistWrites[1].id, messageId);
assert.equal(persistWrites[0].id, messageId);
assert.equal(persistWrites[1].reply.startsWith(snapshot.STORY_REPLY_PREFIX), true);
assert.deepEqual(persistResult.committed, persistWrites[1]);

const unavailable = Object.assign(new Error("unavailable"), { code: "unavailable" });
let threw = false;
try {
  await snapshot.commitWithStoryReplyRulesFallback(nestedWrite, async () => {
    throw unavailable;
  });
} catch (error) {
  threw = error === unavailable;
}
assert.equal(threw, true);

let deniedWithoutNestedCalls = 0;
threw = false;
try {
  await snapshot.commitWithStoryReplyRulesFallback({ texto: "hola" }, async () => {
    deniedWithoutNestedCalls += 1;
    throw denied;
  });
} catch {
  threw = true;
}
assert.equal(threw, true);
assert.equal(deniedWithoutNestedCalls, 1);

const firstOkWrites = [];
const firstOk = await snapshot.commitWithStoryReplyRulesFallback(nestedWrite, async (next) => {
  firstOkWrites.push(next);
});
assert.equal(firstOk.attempts, 1);
assert.equal(firstOk.retriedWithoutNestedMap, false);
assert.equal(firstOkWrites.length, 1);

const committedRowsVisitor = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: persistResult.committed.id, data: persistResult.committed }],
  visitorCtx,
);
const committedRowsOwner = author.mapFirestoreDocsToProfileAnonMessages(
  [{ id: persistResult.committed.id, data: persistResult.committed }],
  ownerCtx,
);
assert.equal(committedRowsVisitor.length, 1);
assert.equal(committedRowsOwner.length, 1);
assert.equal(committedRowsVisitor[0].mine, true);
assert.equal(committedRowsOwner[0].mine, false);
assert.equal(committedRowsVisitor[0].storyReply?.storyId, "story_1");
const reopenedCommitted = cache.cachedMessageToUi(
  cache.uiMessageToCached(committedRowsVisitor[0]),
);
assert.equal(reopenedCommitted.storyReply?.storyId, "story_1");
assert.equal(reopenedCommitted.mine, true);

assert.deepEqual(snapshot.classifyStoryReplyFailure(new snapshot.StoryReplySendError("lookup", "missing_target")), {
  stage: "lookup",
  code: "missing_target",
});
assert.deepEqual(
  snapshot.classifyStoryReplyFailure({ name: "PersistIdentityError", message: "owner_identity_not_ready" }),
  { stage: "identity", code: "owner_identity_not_ready" },
);
assert.deepEqual(
  snapshot.classifyStoryReplyFailure({ code: "permission-denied", message: "Missing or insufficient permissions." }),
  { stage: "write", code: "permission-denied" },
);
assert.equal(
  snapshot.formatStoryReplyFailure(new snapshot.StoryReplySendError("write", "permission-denied")),
  "No se pudo enviar la respuesta (write:permission-denied).",
);
assert.equal(
  snapshot.formatStoryReplyFailure({ name: "PersistIdentityError", message: "owner_identity_not_ready" }),
  "No se pudo confirmar tu identidad (identity:not_ready).",
);
assert.equal(
  snapshot.formatStoryReplyFailure(new snapshot.StoryReplySendError("lookup", "missing_target")),
  "No se pudo encontrar el chat (lookup:missing_target).",
);
const leaked = snapshot.formatStoryReplyFailure(
  new Error("No se pudo guardar el chat. Revisá permisos de Firestore."),
);
assert.equal(leaked.includes("Firestore"), false);
assert.equal(leaked.includes("guardar el chat"), false);
assert.equal(leaked, "No se pudo enviar la respuesta (write:write).");
assert.equal(
  snapshot.formatStoryReplyFailure(
    new snapshot.StoryReplySendError(
      "write",
      "No se pudo guardar el chat. Revisá permisos de Firestore.",
    ),
  ),
  "No se pudo enviar la respuesta (write:error).",
);
assert.equal(snapshot.sanitizeStoryReplyFailureCode("permission-denied"), "permission-denied");
assert.equal(snapshot.sanitizeStoryReplyFailureCode("totally secret stack dump"), "error");
assert.deepEqual(snapshot.applyStoryReplySendAck(true), {
  closeComposer: true,
  showSentToast: true,
  keepComposerText: false,
});
assert.deepEqual(snapshot.applyStoryReplySendAck(false), {
  closeComposer: false,
  showSentToast: false,
  keepComposerText: true,
});

console.log(JSON.stringify({ gate: "STORY_REPLY_WRITER_RENDER", pass: true }, null, 2));
