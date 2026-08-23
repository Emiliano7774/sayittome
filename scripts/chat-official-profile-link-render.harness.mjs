/**
 * CHAT_OFFICIAL_PROFILE_LINK_RENDER
 * Hint/cache never grants a badge. Only an explicit verify result does.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
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
const rowSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ChatVerifiedProfileLinkCard.tsx"),
  "utf8",
);
assert.match(rowSrc, /ml-auto/);
assert.match(rowSrc, /justify-end/);
assert.doesNotMatch(rowSrc, /mr-auto|justify-start/);
assert.doesNotMatch(
  rowSrc,
  /mine\s*\?\s*["']ml-auto|mine\s*\?\s*["'][^"']*mr-auto/,
  "badge alignment must not depend on mine",
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
const ticketId = "a".repeat(32);
const forgedComplete = {
  ticketId,
  ownerUid,
  username: "sex",
  chatId,
  messageId: "msg1",
};

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

const textOnlyDoc = {
  texto: OFFICIAL,
  text: OFFICIAL,
  fromUid: visitorAnon,
  senderKind: "anon",
  senderRole: "anon",
  readBy: { [visitorAnon]: true },
};

assert.equal(author.resolveFirestoreMessageType(textOnlyDoc), "text");
assert.equal(persist.resolvePersistAnonMessageType(undefined), "text");

const mineMapped = author.mapFirestoreDocToProfileAnonMessage("msg1", textOnlyDoc, visitorCtx);
assert.equal(decide.decideOfficialProfileLinkRender({ ...mineMapped, chatId }), null);

const attestedDoc = { ...textOnlyDoc, verifiedProfileAttestation: forgedComplete };
const mineAttested = author.mapFirestoreDocToProfileAnonMessage("msg1", attestedDoc, visitorCtx);
const peerAttested = author.mapFirestoreDocToProfileAnonMessage("msg1", attestedDoc, ownerCtx);

assert.equal(
  decide.decideOfficialProfileLinkRender({ ...mineAttested, chatId }),
  null,
  "complete forged attestation must not badge before verify",
);
assert.equal(decide.decideOfficialProfileLinkRender({ ...peerAttested, chatId }), null);

const verified = { ok: true, username: "sex" };
const mineBadge = decide.decideOfficialProfileLinkRender({ ...mineAttested, chatId }, verified);
const peerBadge = decide.decideOfficialProfileLinkRender({ ...peerAttested, chatId }, verified);
assert.ok(mineBadge);
assert.deepEqual(mineBadge, peerBadge);
assert.equal(mineBadge.profileHref, "/u/sex");

const remountMine = author.mapFirestoreDocToProfileAnonMessage("msg1", attestedDoc, visitorCtx);
assert.equal(
  decide.decideOfficialProfileLinkRender({ ...remountMine, chatId }),
  null,
  "remount must re-verify; cache/hint is not trust",
);

const cached = cache.uiMessageToCached({ ...mineAttested, chatId });
assert.deepEqual(cached.verifiedProfileAttestation, { ticketId });
assert.equal("username" in (cached.verifiedProfileAttestation || {}), false);
assert.equal(
  decide.decideOfficialProfileLinkRender({ ...cache.cachedMessageToUi(cached), chatId }),
  null,
);

assert.equal(
  decide.decideOfficialProfileLinkRender(
    {
      text: OFFICIAL,
      type: "image",
      mediaUrl: "https://cdn.example/pic.jpg",
      verifiedProfileAttestation: forgedComplete,
      chatId,
      id: "msg1",
    },
    verified,
  ),
  null,
);

assert.equal(
  decide.decideOfficialProfileLinkRender(
    {
      text: OFFICIAL,
      type: "text",
      deletedForEveryone: true,
      verifiedProfileAttestation: forgedComplete,
      chatId,
      id: "msg1",
    },
    verified,
  ),
  null,
);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_OFFICIAL_PROFILE_LINK_RENDER",
      pass: true,
      href: mineBadge.profileHref,
      mine: mineAttested.mine,
      peer: peerAttested.mine,
    },
    null,
    2,
  ),
);
