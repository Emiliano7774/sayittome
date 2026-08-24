/**
 * Chat Storage auth for visitor media — imports production upload + authorship helpers.
 * Usage: node --experimental-strip-types scripts/chat-storage-auth.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const auth = await import(
  pathToFileURL(path.join(root, "src/lib/auth/ensureStorageAuth.ts")).href
);
const upload = await import(
  pathToFileURL(path.join(root, "src/lib/media/upload.ts")).href
);
const author = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);
const inbox = await import(
  pathToFileURL(path.join(root, "src/lib/chat/inboxQueryCohort.ts")).href
);
const errors = await import(
  pathToFileURL(path.join(root, "src/lib/media/uploadFileToStorage.ts")).href
);
const i18n = await import(
  pathToFileURL(path.join(root, "src/lib/i18n/messages.ts")).href
);

assert.equal(auth.resolveStorageAuthAction(null, { allowAnonymous: true }), "sign-in-anonymous");
assert.equal(auth.resolveStorageAuthAction(null, {}), "reject");
assert.equal(
  auth.resolveStorageAuthAction({ uid: "profile_uid", isAnonymous: false }, { allowAnonymous: true }),
  "use-current",
);
assert.equal(
  auth.resolveStorageAuthAction({ uid: "anon_fb", isAnonymous: true }, { allowAnonymous: true }),
  "use-current",
);

const profileUser = { uid: "profile_uid", isAnonymous: false };
const anonUser = { uid: "anon_fb_uid", isAnonymous: true };
assert.equal(author.profileAuthUid(profileUser), "profile_uid");
assert.equal(author.profileAuthUid(anonUser), "");
assert.equal(author.profileAuthUid(null), "");

const visitorCohortBefore = inbox.inboxQueryCohortKey({
  uid: author.profileAuthUid(null),
  anonId: "anon_visitor",
  uidFamily: Boolean(author.profileAuthUid(null)),
  anonFamily: true,
});
const visitorCohortAfterAnonAuth = inbox.inboxQueryCohortKey({
  uid: author.profileAuthUid(anonUser),
  anonId: "anon_visitor",
  uidFamily: Boolean(author.profileAuthUid(anonUser)),
  anonFamily: true,
});
assert.equal(visitorCohortBefore, visitorCohortAfterAnonAuth);

const chatId = "anon_visitor__anon_to__maria";
const clientId = "client_media_1";
assert.equal(
  upload.chatMessageMediaPath(chatId, clientId, "image"),
  `chats/${chatId}/${clientId}_jpg`,
);

const order = [];
let ensureCalls = 0;
const blob = new Blob(["img"], { type: "image/jpeg" });
const uploaded = await upload.uploadChatMessageMedia(
  chatId,
  clientId,
  blob,
  "image",
  undefined,
  undefined,
  {
    async ensureStorageAuth(options) {
      ensureCalls += 1;
      order.push("ensure");
      assert.equal(options?.allowAnonymous, true);
      assert.equal(ensureCalls, 1);
      return { uid: "anon_fb_uid", isAnonymous: true };
    },
    async uploadMedia(path, file) {
      order.push("upload");
      assert.equal(path, `chats/${chatId}/${clientId}_jpg`);
      assert.equal(file, blob);
      return "https://example.test/chat-media.jpg";
    },
  },
);
assert.equal(uploaded.url, "https://example.test/chat-media.jpg");
assert.equal(uploaded.path, `chats/${chatId}/${clientId}_jpg`);
assert.equal(ensureCalls, 1);
assert.deepEqual(order, ["ensure", "upload"]);

let profileEnsureUser = null;
await upload.uploadChatMessageMedia(
  chatId,
  "client_profile",
  blob,
  "image",
  undefined,
  undefined,
  {
    async ensureStorageAuth() {
      profileEnsureUser = { uid: "profile_uid", isAnonymous: false };
      return profileEnsureUser;
    },
    async uploadMedia() {
      return "https://example.test/profile-media.jpg";
    },
  },
);
assert.equal(author.profileAuthUid(profileEnsureUser), "profile_uid");

assert.equal(errors.formatStorageUploadError({ code: "storage/unauthorized" }), "storage_unauthorized");
assert.equal(upload.isChatMediaStorageUnauthorized({ code: "storage/unauthorized" }), true);
assert.equal(upload.isChatMediaStorageUnauthorized({ code: "storage/canceled" }), false);
assert.match(i18n.MESSAGES.es.chat_upload_unauthorized, /storage\/unauthorized/);
assert.equal(i18n.MESSAGES.es.chat_upload_unauthorized.includes("Firestore"), false);
assert.equal(i18n.MESSAGES.es.story_reply_fail.includes("Firestore"), false);

console.log(JSON.stringify({ gate: "CHAT_STORAGE_AUTH", pass: true }, null, 2));
