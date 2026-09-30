/**
 * End-to-end check of the cold-open authorship chain against production modules:
 * Firestore doc -> mine -> sessionStorage cache -> rehydrate after auth settles.
 *
 * Usage: node --experimental-strip-types scripts/chat-cold-open-authorship.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = installHarnessAlias();
installHarnessWindow();
const author = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);

const threadAnonId = "anon_thread_visitor";

function messageData(text, fromUid = threadAnonId) {
  return {
    texto: text,
    fromUid,
    senderRole: "anon",
    senderKind: "anon",
    createdAt: { seconds: 1790000000, nanoseconds: 0 },
  };
}

// Cold open: auth has not settled yet, so identityReady is false.
const coldCtx = {
  threadAnonId,
  liveAnonId: threadAnonId,
  profileUid: "owner_uid_eli",
  isOwnerViewing: false,
  identityReady: false,
  authUid: "",
};
const cold = [
  ["m1", "hola"],
  ["m2", "seguis ahi?"],
].map(([id, text]) =>
  author.mapFirestoreDocToProfileAnonMessage(id, messageData(text), coldCtx),
);

assert.deepEqual(
  cold.map((m) => m.mine),
  [true, true],
  "visitor messages must paint on the right even before auth settles",
);
assert.deepEqual(
  cold.map((m) => m.mineResolved),
  [true, true],
  "a thread-anon match is a settled decision",
);

// Same cold open, but the author id is a rotated one this device cannot prove.
const rotated = author.mapFirestoreDocToProfileAnonMessage(
  "m3",
  messageData("otro", "anon_unknown_other"),
  coldCtx,
);
assert.equal(rotated.mine, false);
assert.equal(rotated.mineResolved, false, "an unprovable author stays unresolved");

// Logged-in visitor (profile A → profile B as anon): own rows stay on the
// right before targetUid/identityReady settle. The previous gate treated any
// Firebase uid as "not a visitor" and painted those bubbles as incoming.
const loggedInVisitorCtx = {
  chatId: "anon_thread_visitor__anon_to__eli0990",
  chatAnonSessionId: threadAnonId,
  currentUid: "visitor_uid_logged_in",
  targetUid: "",
  chatOwnerUid: "",
  viewerUsername: "visitorname",
  identityReady: false,
  authReady: true,
};
const loggedInVisitor = [
  ["m1", "hola"],
  ["m2", "seguis ahi?"],
].map(([id, text]) =>
  author.mapFirestoreDocToProfileAnonMessage(id, messageData(text), {
    ...author.buildProfileAnonViewerContext(loggedInVisitorCtx),
    identityReady: false,
  }),
);
assert.deepEqual(
  loggedInVisitor.map((m) => m.mine),
  [true, true],
  "logged-in visitor messages stay on the right before target uid loads",
);
assert.equal(
  author.mapFirestoreDocToProfileAnonMessage(
    "owner-reply",
    {
      texto: "hola de vuelta",
      fromUid: "profile_owner_uid_eli",
      senderRole: "profile",
      senderKind: "profile",
      senderAuthUid: "owner_uid_eli",
      createdAt: { seconds: 1790000001, nanoseconds: 0 },
    },
    {
      ...author.buildProfileAnonViewerContext(loggedInVisitorCtx),
      identityReady: false,
    },
  ).mine,
  false,
  "the other profile's replies stay incoming for the logged-in visitor",
);

const poisoned = author.remapProfileAnonMessagesMine(
  [
    {
      id: "cached-wrong-side",
      fromUid: threadAnonId,
      senderRole: "anon",
      senderKind: "anon",
      mine: false,
      mineResolved: true,
    },
  ],
  {
    ...author.buildProfileAnonViewerContext(loggedInVisitorCtx),
    identityReady: false,
  },
);
assert.equal(
  poisoned[0].mine,
  true,
  "a cached incoming side on the thread anon must not stick for the visitor",
);

// Whatever is unresolved must never reach the durable cache.
const cached = [...cold, rotated].map((m) =>
  cache.uiMessageToCached({
    id: m.id,
    text: m.text,
    fromUid: m.fromUid,
    mine: m.mine,
    mineResolved: m.mineResolved,
    createdAtMs: m.createdAtMs,
  }),
);
assert.deepEqual(
  cached.map((m) => m.mine),
  [true, true, undefined],
  "only settled sides are persisted",
);

// After auth settles the resolved sides hold and the unresolved one re-resolves.
const warm = author.remapProfileAnonMessagesMine([...cold, rotated], {
  ...coldCtx,
  identityReady: true,
  knownAnonIds: [threadAnonId],
});
assert.deepEqual(
  warm.map((m) => m.mine),
  [true, true, false],
  "sides stay stable once identity settles",
);

console.log("pass authorship_cold_open_chain", JSON.stringify({ cold: cold.map((m) => m.mine), cached: cached.map((m) => m.mine), warm: warm.map((m) => m.mine) }));
