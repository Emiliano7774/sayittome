/**
 * Incoming anon inbox rows must not use the owner's profile photo.
 * Usage: node --experimental-strip-types scripts/inbox-anon-avatar.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const peer = await import(pathToFileURL(path.join(root, "src/lib/chat/inboxPeerTitle.ts")).href);

const ownerUid = "ownerUid";
const ownerPhoto = "https://cdn.example/owner.jpg";
const incoming = {
  id: "anon_r121522__anon_to__emi",
  targetUsername: "emi",
  targetUid: "",
  receptorUid: "",
  anonOwnerUid: "",
  anonSessionId: "anon_r121522",
  targetPhoto: ownerPhoto,
  lastMessage: "hola",
};

assert.equal(
  peer.isIncomingAnonChatForOwner(incoming, ownerUid, "emi"),
  true,
  "username match is incoming even before owner uid fields arrive",
);
assert.equal(peer.chatPeerTitle(incoming, ownerUid, "emi").startsWith("Anon-"), true);
assert.equal(
  peer.shouldHidePeerProfilePhoto(incoming, ownerUid, "emi", ownerPhoto),
  true,
);
assert.equal(peer.shouldShowAnonPeerInbox(incoming, ownerUid, "emi"), true);

const outgoing = {
  id: "anon_mine__anon_to__other",
  targetUsername: "other",
  targetUid: "otherUid",
  receptorUid: "otherUid",
  anonOwnerUid: "otherUid",
  anonSessionId: "anon_mine",
  targetPhoto: "https://cdn.example/other.jpg",
  lastMessage: "hey",
};

assert.equal(peer.isIncomingAnonChatForOwner(outgoing, ownerUid, "emi"), false);
assert.equal(peer.chatPeerTitle(outgoing, ownerUid, "emi"), "other");
assert.equal(
  peer.shouldHidePeerProfilePhoto(outgoing, ownerUid, "emi", ownerPhoto),
  false,
);

const incomingByUid = {
  ...incoming,
  targetUsername: "",
  targetUid: ownerUid,
  receptorUid: ownerUid,
};
assert.equal(peer.isIncomingAnonChatForOwner(incomingByUid, ownerUid), true);
assert.equal(
  peer.shouldHidePeerProfilePhoto(incomingByUid, ownerUid, "", ownerPhoto),
  true,
  "own photo stays hidden when the uid already matches",
);

console.log("inbox-anon-avatar harness: PASS");
