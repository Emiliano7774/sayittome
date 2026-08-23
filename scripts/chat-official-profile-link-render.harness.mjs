/**
 * CHAT_OFFICIAL_PROFILE_LINK_RENDER
 * Firestore-like doc without `type` → map → card for mine/peer + remount.
 * Usage: node --experimental-strip-types scripts/chat-official-profile-link-render.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const author = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);
const decide = await import(
  pathToFileURL(path.join(root, "src/lib/chat/officialProfileLinkMessage.ts")).href
);
const persist = await import(
  pathToFileURL(path.join(root, "src/lib/chat/persistAnonMessage.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);

const OFFICIAL = "https://sytm.me/@sex";
const chatId = "anon_visitor__anon_to__sex";
const visitorAnon = "anon_visitor";
const ownerUid = "uid_owner";

const visitorCtx = author.buildProfileAnonViewerContext({
  chatId,
  chatAnonSessionId: visitorAnon,
  currentUid: "",
  targetUid: ownerUid,
  chatOwnerUid: ownerUid,
  viewerUsername: "",
  authReady: true,
  identityReady: true,
  liveAnonId: visitorAnon,
  knownAnonIds: [visitorAnon],
});

const ownerCtx = author.buildProfileAnonViewerContext({
  chatId,
  chatAnonSessionId: visitorAnon,
  currentUid: ownerUid,
  targetUid: ownerUid,
  chatOwnerUid: ownerUid,
  viewerUsername: "sex",
  authReady: true,
  identityReady: true,
  liveAnonId: "anon_owner_browser",
  knownAnonIds: [visitorAnon],
});

/** Physical persist shape: text fields, no `type`. */
const firestoreDoc = {
  texto: OFFICIAL,
  text: OFFICIAL,
  fromUid: visitorAnon,
  senderKind: "anon",
  senderRole: "anon",
  readBy: { [visitorAnon]: true },
};

assert.equal("type" in firestoreDoc, false, "repro doc must omit type");
assert.equal(author.resolveFirestoreMessageType(firestoreDoc), "text");
assert.equal(persist.resolvePersistAnonMessageType(undefined), "text");
assert.equal(persist.resolvePersistAnonMessageType("text"), "text");
assert.equal(persist.resolvePersistAnonMessageType("image"), "image");

function assertCard(link, label) {
  assert.ok(link, `${label} must render the official card`);
  assert.equal(link.username, "sex");
  assert.equal(link.profileHref, "/u/sex");
  assert.equal(link.displayLink, "sytm.me/@sex");
}

const mineMapped = author.mapFirestoreDocToProfileAnonMessage("msg1", firestoreDoc, visitorCtx);
assert.ok(mineMapped, "visitor map must keep the text doc");
assert.equal(mineMapped.type, "text");
assert.equal(mineMapped.mine, true);
assert.equal(mineMapped.deletedForEveryone, false);
const mineCard = decide.decideOfficialProfileLinkRender(mineMapped);
assertCard(mineCard, "visitor/mapped");

const peerMapped = author.mapFirestoreDocToProfileAnonMessage("msg1", firestoreDoc, ownerCtx);
assert.ok(peerMapped, "owner map must keep the peer text doc");
assert.equal(peerMapped.type, "text");
assert.equal(peerMapped.mine, false);
const peerCard = decide.decideOfficialProfileLinkRender(peerMapped);
assertCard(peerCard, "owner/mapped");
assert.deepEqual(peerCard, mineCard, "sender and receiver share the same card");

const remountMine = author.mapFirestoreDocToProfileAnonMessage("msg1", firestoreDoc, visitorCtx);
const remountPeer = author.mapFirestoreDocToProfileAnonMessage("msg1", firestoreDoc, ownerCtx);
assert.equal(remountMine.type, "text");
assert.equal(remountPeer.type, "text");
assert.deepEqual(decide.decideOfficialProfileLinkRender(remountMine), mineCard);
assert.deepEqual(decide.decideOfficialProfileLinkRender(remountPeer), peerCard);

const optimistic = {
  text: OFFICIAL,
  mine: true,
  fromUid: visitorAnon,
};
assert.equal("type" in optimistic, false);
assertCard(
  decide.decideOfficialProfileLinkRender(optimistic),
  "optimistic omitted type",
);
assert.deepEqual(
  decide.decideOfficialProfileLinkRender(optimistic),
  decide.decideOfficialProfileLinkRender(mineMapped),
  "ACK/snapshot must keep the optimistic card",
);

const cached = cache.uiMessageToCached(mineMapped);
assert.equal(cached.type, "text");
const fromCache = cache.cachedMessageToUi({
  id: "msg1",
  text: OFFICIAL,
  fromUid: visitorAnon,
});
assert.equal(fromCache.type, "text");
assertCard(decide.decideOfficialProfileLinkRender(fromCache), "cache remount omitted type");

const mediaDoc = {
  texto: "",
  mediaUrl: "https://cdn.example/pic.jpg",
  fromUid: visitorAnon,
};
const mediaMapped = author.mapFirestoreDocToProfileAnonMessage("img1", mediaDoc, visitorCtx);
assert.equal(mediaMapped?.type, "image");
assert.equal(decide.decideOfficialProfileLinkRender(mediaMapped), null);
assert.equal(
  decide.decideOfficialProfileLinkRender({
    text: OFFICIAL,
    type: "image",
    mediaUrl: "https://cdn.example/pic.jpg",
  }),
  null,
  "must not classify media as an official text card",
);

const deletedDoc = {
  texto: OFFICIAL,
  fromUid: visitorAnon,
  deletedForEveryone: true,
};
const deletedMapped = author.mapFirestoreDocToProfileAnonMessage("del1", deletedDoc, visitorCtx);
assert.equal(deletedMapped?.deletedForEveryone, true);
assert.equal(decide.decideOfficialProfileLinkRender(deletedMapped), null);
assert.equal(
  decide.decideOfficialProfileLinkRender({
    text: OFFICIAL,
    type: "text",
    deletedForEveryone: true,
  }),
  null,
  "must not classify deleted messages",
);

assert.equal(
  decide.decideOfficialProfileLinkRender({ text: "hola https://sytm.me/@sex" }),
  null,
);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_OFFICIAL_PROFILE_LINK_RENDER",
      pass: true,
      href: mineCard.profileHref,
      mine: mineMapped.mine,
      peer: peerMapped.mine,
    },
    null,
    2,
  ),
);
