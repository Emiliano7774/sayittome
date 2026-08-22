/**
 * Server delete decision: auth, author, hide-for-me, tombstone, latest, storage path.
 * Usage: node --experimental-strip-types scripts/chat-message-delete.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const core = await import(
  pathToFileURL(path.join(root, "functions/src/deleteChatMessageCore.ts")).href
);
const client = await import(
  pathToFileURL(path.join(root, "src/lib/chat/messageDelete.ts")).href
);
const persist = await import(
  pathToFileURL(path.join(root, "src/lib/chat/persistMessageDelete.ts")).href
);
const longPress = await import(
  pathToFileURL(path.join(root, "src/lib/chat/messageLongPress.ts")).href
);
const mapper = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);

assert.equal(core.DELETED_MESSAGE_PREVIEW, "Mensaje eliminado");
assert.equal(core.tombstonePublicFields().previousMediaUrl, undefined);
assert.equal(core.tombstonePublicFields().mediaUrl, "");

const unauth = core.decideChatMessageDelete({
  uid: "",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: {},
  message: {},
});
assert.equal(unauth.ok, false);
assert.equal(unauth.error, "unauthenticated");

const invalid = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "both",
  chatId: "c1",
  messageId: "m1",
  chat: {},
  message: {},
});
assert.equal(invalid.ok, false);
assert.equal(invalid.error, "invalid-argument");

const missing = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: null,
  message: { fromUid: "uidA" },
});
assert.equal(missing.ok, false);
assert.equal(missing.error, "not-found");

const hideMe = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: { latestMessageId: "m2", participantes: ["uidA", "uidB"], targetUid: "uidA" },
  message: { fromUid: "anon_x", hiddenFor: {} },
});
assert.equal(hideMe.ok, true);
assert.equal(hideMe.mode, "me");
assert.equal(hideMe.hideKey, "uidA");
assert.equal(hideMe.alreadyApplied, false);

const hideIdempotent = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: { participantes: ["uidA"] },
  message: { hiddenFor: { uidA: true } },
});
assert.equal(hideIdempotent.alreadyApplied, true);

const strangerHide = core.decideChatMessageDelete({
  uid: "stranger",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: {
    participantes: ["uidA", "uidB"],
    targetUid: "uidA",
    initiatorUid: "uidB",
  },
  message: { fromUid: "uidA", senderAuthUid: "uidA" },
});
assert.equal(strangerHide.ok, false);
assert.equal(strangerHide.error, "permission-denied");
assert.equal(
  core.isChatMember({
    uid: "stranger",
    chat: { participantes: ["uidA", "uidB"], targetUid: "uidA" },
    message: { fromUid: "uidA" },
  }),
  false,
);

const denied = core.decideChatMessageDelete({
  uid: "uidB",
  mode: "everyone",
  chatId: "c1",
  messageId: "m1",
  chat: { latestMessageId: "m1" },
  message: { fromUid: "profile_uidA", senderAuthUid: "uidA" },
});
assert.equal(denied.ok, false);
assert.equal(denied.error, "permission-denied");

const profileAuthor = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "everyone",
  chatId: "c1",
  messageId: "m1",
  chat: { latestMessageId: "m1", lastMessage: "hola" },
  message: {
    fromUid: "profile_uidA",
    senderAuthUid: "uidA",
    senderKind: "profile",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/chats%2Fc1%2Ffile.wav?alt=media",
  },
});
assert.equal(profileAuthor.ok, true);
assert.equal(profileAuthor.summary.lastMessage, "Mensaje eliminado");
assert.equal(profileAuthor.storagePath, "chats/c1/file.wav");
assert.equal(core.isQuietEveryoneDeleteSummary(profileAuthor.summary), true);
assert.equal("lastMessageAt" in profileAuthor.summary, false);
assert.equal("updatedAt" in profileAuthor.summary, false);
assert.equal("unreadCounts" in profileAuthor.summary, false);
assert.equal("readBy" in profileAuthor.summary, false);

const notLatest = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "everyone",
  chatId: "c1",
  messageId: "old",
  chat: { latestMessageId: "m1", lastMessage: "ultimo" },
  message: { fromUid: "uidA", senderAuthUid: "uidA" },
});
assert.equal(notLatest.ok, true);
assert.equal(notLatest.summary, null);

const anonAuthor = core.isCanonicalMessageAuthor({
  uid: "anonUid",
  message: { fromUid: "anon_sess", createdByAuthUid: "anonUid" },
  chat: { anonSessionId: "anon_sess", initiatorUid: "anonUid" },
});
assert.equal(anonAuthor, true);

const legacyAuthor = core.isCanonicalMessageAuthor({
  uid: "legacyUid",
  message: { fromUid: "legacyUid" },
});
assert.equal(legacyAuthor, true);

const tombstone = client.tombstoneDeletedMessage();
assert.equal("previousMediaUrl" in tombstone, false);

let called;
const persistResult = await persist.persistMessageDelete(
  { chatId: "c1", messageId: "m1", mode: "everyone" },
  {
    ensureAuth: async () => ({ uid: "uidA" }),
    callDelete: async (payload) => {
      called = payload;
      return { ok: true };
    },
  },
);
assert.equal(persistResult.ok, true);
assert.deepEqual(called, { chatId: "c1", messageId: "m1", mode: "everyone" });

assert.equal(persist.DELETE_CHAT_MESSAGE_CALLABLE, "deleteChatMessage");
assert.equal(persist.DELETE_CHAT_MESSAGE_REGION, "us-central1");

const ctx = mapper.buildProfileAnonViewerContext({
  chatId: "anon_sess__anon_to__maria",
  chatAnonSessionId: "anon_sess",
  currentUid: "uidA",
  targetUid: "uidA",
  chatOwnerUid: "uidA",
  viewerUsername: "maria",
  authReady: true,
  identityReady: true,
});
const mappedHidden = mapper.mapFirestoreDocToProfileAnonMessage(
  "m1",
  { texto: "hola", fromUid: "anon_sess", hiddenFor: { uidA: true } },
  { ...ctx, hideIdentities: ["uidA"] },
);
assert.equal(mappedHidden, null);

const mappedTombstone = mapper.mapFirestoreDocToProfileAnonMessage(
  "m2",
  { deletedForEveryone: true, fromUid: "anon_sess", mediaUrl: "", texto: "" },
  ctx,
);
assert.equal(mappedTombstone?.text, "Mensaje eliminado");
assert.equal(mappedTombstone?.deletedForEveryone, true);
assert.equal(mappedTombstone?.mediaUrl, undefined);

let state = longPress.createMessageLongPressState();
state = longPress.reduceMessageLongPress(state, { type: "down", x: 0, y: 0, pointerId: 1 });
state = longPress.reduceMessageLongPress(state, { type: "fire" });
assert.equal(state.phase, "fired");
assert.equal(longPress.shouldSuppressMessageClick(state), true);
state = longPress.reduceMessageLongPress(state, { type: "up" });
assert.equal(state.suppressClick, true);

const require = createRequire(import.meta.url);
const { handleDeleteChatMessage } = require(
  path.join(root, "functions/lib/deleteChatMessage.js"),
);

function createFakeDb(initial) {
  const store = new Map(Object.entries(initial));
  const deletedStorage = [];

  function makeRef(pathName) {
    return {
      path: pathName,
      id: pathName.split("/").pop(),
      collection(name) {
        return {
          doc(id) {
            return makeRef(`${pathName}/${name}/${id}`);
          },
        };
      },
      async get() {
        const data = store.get(pathName);
        return {
          exists: data !== undefined,
          data: () => data,
          ref: makeRef(pathName),
        };
      },
      async delete() {
        store.delete(pathName);
      },
    };
  }

  const db = {
    collection(name) {
      return {
        doc(id) {
          return makeRef(`${name}/${id}`);
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          const data = store.get(ref.path);
          return {
            exists: data !== undefined,
            data: () => data,
            ref,
          };
        },
        update(ref, data) {
          const current = store.get(ref.path) || {};
          const next = { ...current };
          for (const [key, value] of Object.entries(data)) {
            if (key.includes(".")) {
              const [root, child] = key.split(".");
              next[root] = { ...(next[root] || {}), [child]: value };
            } else {
              next[key] = value;
            }
          }
          store.set(ref.path, next);
        },
        set(ref, data) {
          store.set(ref.path, { ...(store.get(ref.path) || {}), ...data });
        },
      };
      await fn(tx);
    },
  };
  return {
    db,
    store,
    deletedStorage,
    deleteStoragePath: async (pathName) => {
      deletedStorage.push(pathName);
    },
  };
}

const fake = createFakeDb({
  "chats/c1": {
    latestMessageId: "m1",
    lastMessage: "hola",
    lastMessageAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    unreadCounts: { uidB: 2 },
    readBy: { uidA: true, uidB: false },
    participantes: ["uidA", "uidB"],
  },
  "chats/c1/mensajes/m1": {
    fromUid: "uidA",
    senderAuthUid: "uidA",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/chats%2Fc1%2Ffile.wav?alt=media",
  },
});

const everyone = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "c1", messageId: "m1", mode: "everyone" } },
  { db: fake.db, deleteStoragePath: fake.deleteStoragePath },
);
assert.equal(everyone.ok, true);
assert.equal(fake.store.get("chats/c1/mensajes/m1").deletedForEveryone, true);
const latestAfter = fake.store.get("chats/c1");
assert.equal(latestAfter.lastMessage, "Mensaje eliminado");
assert.equal(latestAfter.lastMessageAt, 1_700_000_000_000);
assert.equal(latestAfter.updatedAt, 1_700_000_000_000);
assert.deepEqual(latestAfter.unreadCounts, { uidB: 2 });
assert.deepEqual(latestAfter.readBy, { uidA: true, uidB: false });
assert.deepEqual(fake.deletedStorage, ["chats/c1/file.wav"]);

const again = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "c1", messageId: "m1", mode: "everyone" } },
  { db: fake.db, deleteStoragePath: fake.deleteStoragePath },
);
assert.equal(again.alreadyApplied, true);

try {
  await handleDeleteChatMessage(
    { auth: { uid: "uidB" }, data: { chatId: "c1", messageId: "m1", mode: "everyone" } },
    { db: fake.db, deleteStoragePath: fake.deleteStoragePath },
  );
  assert.fail("expected permission-denied");
} catch (error) {
  assert.equal(String(error.message || error).includes("canonical") || String(error.code || "").includes("permission") || String(error.message || "").includes("Not allowed"), true);
}

try {
  await handleDeleteChatMessage(
    { auth: { uid: "stranger" }, data: { chatId: "c1", messageId: "m1", mode: "me" } },
    { db: fake.db, deleteStoragePath: fake.deleteStoragePath },
  );
  assert.fail("expected stranger hide permission-denied");
} catch (error) {
  assert.equal(
    String(error.code || "").includes("permission") || String(error.message || "").includes("Not allowed"),
    true,
  );
}

const hideOk = await handleDeleteChatMessage(
  { auth: { uid: "uidB" }, data: { chatId: "c1", messageId: "m1", mode: "me" } },
  { db: fake.db },
);
assert.equal(hideOk.ok, true);
assert.equal(fake.store.get("chats/c1/mensajes/m1").hiddenFor.uidB, true);

assert.equal(core.pickUniqueChatMessageLocation([]), null);
assert.equal(
  core.pickUniqueChatMessageLocation([
    { chatRoot: "chats", messageSubcollection: "mensajes" },
    { chatRoot: "chats_anonimos", messageSubcollection: "mensajes" },
  ]),
  null,
);
assert.deepEqual(
  core.pickUniqueChatMessageLocation([
    { chatRoot: "chats_anonimos", messageSubcollection: "messages" },
  ]),
  { chatRoot: "chats_anonimos", messageSubcollection: "messages" },
);

const anonMember = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "me",
  chatId: "pad_a_b",
  messageId: "m9",
  chat: { solicitanteUid: "uidA", destinatarioUid: "uidB", ultimoMensaje: "hola" },
  message: { senderId: "uidB", senderTipo: "perfil" },
});
assert.equal(anonMember.ok, true);
assert.equal(anonMember.hideKey, "uidA");

const anonEveryone = core.decideChatMessageDelete({
  uid: "uidA",
  mode: "everyone",
  chatId: "pad_a_b",
  messageId: "m9",
  chat: {
    solicitanteUid: "uidA",
    destinatarioUid: "uidB",
    latestMessageId: "m9",
    ultimoMensaje: "audio",
  },
  message: {
    senderId: "uidA",
    senderTipo: "perfil",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/chats_anonimos%2Fpad_a_b%2Ffile.wav?alt=media",
  },
});
assert.equal(anonEveryone.ok, true);
assert.equal(anonEveryone.storagePath, "chats_anonimos/pad_a_b/file.wav");
assert.equal(core.isQuietEveryoneDeleteSummary(anonEveryone.summary), true);

const strangerAnon = core.decideChatMessageDelete({
  uid: "intruder",
  mode: "me",
  chatId: "pad_a_b",
  messageId: "m9",
  chat: { solicitanteUid: "uidA", destinatarioUid: "uidB" },
  message: { senderId: "uidA" },
});
assert.equal(strangerAnon.ok, false);
assert.equal(strangerAnon.error, "permission-denied");

const anonThread = createFakeDb({
  "chats_anonimos/pad_a_b": {
    solicitanteUid: "uidA",
    destinatarioUid: "uidB",
    latestMessageId: "m9",
    ultimoMensaje: "audio",
    lastMessageAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    unreadCounts: { uidB: 1 },
  },
  "chats_anonimos/pad_a_b/mensajes/m9": {
    senderId: "uidA",
    senderTipo: "perfil",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/chats_anonimos%2Fpad_a_b%2Ffile.wav?alt=media",
  },
});

const anonDelete = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "pad_a_b", messageId: "m9", mode: "everyone" } },
  { db: anonThread.db, deleteStoragePath: anonThread.deleteStoragePath },
);
assert.equal(anonDelete.ok, true);
assert.equal(anonThread.store.get("chats_anonimos/pad_a_b/mensajes/m9").deletedForEveryone, true);
const anonSummary = anonThread.store.get("chats_anonimos/pad_a_b");
assert.equal(anonSummary.ultimoMensaje, "Mensaje eliminado");
assert.equal(anonSummary.lastMessage, "Mensaje eliminado");
assert.equal(anonSummary.lastMessageAt, 1_700_000_000_000);
assert.equal(anonSummary.updatedAt, 1_700_000_000_000);
assert.deepEqual(anonSummary.unreadCounts, { uidB: 1 });
assert.deepEqual(anonThread.deletedStorage, ["chats_anonimos/pad_a_b/file.wav"]);

const messagesSub = createFakeDb({
  "chats_anonimos/c2": {
    solicitanteUid: "uidA",
    destinatarioUid: "uidB",
  },
  "chats_anonimos/c2/messages/mx": {
    senderId: "uidA",
  },
});
const hideMessages = await handleDeleteChatMessage(
  { auth: { uid: "uidB" }, data: { chatId: "c2", messageId: "mx", mode: "me" } },
  { db: messagesSub.db },
);
assert.equal(hideMessages.ok, true);
assert.equal(messagesSub.store.get("chats_anonimos/c2/messages/mx").hiddenFor.uidB, true);

const missingRoots = createFakeDb({});
try {
  await handleDeleteChatMessage(
    { auth: { uid: "uidA" }, data: { chatId: "missing", messageId: "m1", mode: "me" } },
    { db: missingRoots.db },
  );
  assert.fail("expected not-found for missing chat roots");
} catch (error) {
  assert.equal(String(error.message || error).includes("not found") || String(error.code || "").includes("not-found"), true);
}

const ambiguous = createFakeDb({
  "chats/dup": { participantes: ["uidA", "uidB"] },
  "chats/dup/mensajes/m1": { fromUid: "uidA", senderAuthUid: "uidA" },
  "chats_anonimos/dup": { solicitanteUid: "uidA", destinatarioUid: "uidB" },
  "chats_anonimos/dup/mensajes/m1": { senderId: "uidA" },
});
try {
  await handleDeleteChatMessage(
    { auth: { uid: "uidA" }, data: { chatId: "dup", messageId: "m1", mode: "everyone" } },
    { db: ambiguous.db },
  );
  assert.fail("expected fail-closed ambiguous location");
} catch (error) {
  assert.equal(
    String(error.message || error).includes("not found") || String(error.code || "").includes("not-found"),
    true,
  );
}
assert.equal(ambiguous.store.get("chats/dup/mensajes/m1").deletedForEveryone, undefined);
assert.equal(ambiguous.store.get("chats_anonimos/dup/mensajes/m1").deletedForEveryone, undefined);

const storageFail = createFakeDb({
  "chats/c3": {
    latestMessageId: "m3",
    lastMessage: "foto",
    lastMessageAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    unreadCounts: { uidB: 1 },
    participantes: ["uidA", "uidB"],
  },
  "chats/c3/mensajes/m3": {
    fromUid: "uidA",
    senderAuthUid: "uidA",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/chats%2Fc3%2Fpic.jpg?alt=media",
  },
});
const failedCleanup = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "c3", messageId: "m3", mode: "everyone" } },
  {
    db: storageFail.db,
    deleteStoragePath: async () => {
      throw Object.assign(new Error("quota"), { code: "storage/retry-limit-exceeded" });
    },
  },
);
assert.equal(failedCleanup.ok, true);
assert.equal(failedCleanup.cleanupPending, true);
assert.equal(storageFail.store.get("chats/c3/mensajes/m3").deletedForEveryone, true);
assert.equal(storageFail.store.get("chats/c3/mensajes/m3").mediaUrl, "");
assert.equal(storageFail.store.get("chats/c3/deletedAttachments/m3").path, "chats/c3/pic.jpg");
assert.equal(storageFail.store.get("chats/c3").lastMessageAt, 1_700_000_000_000);

const retryPending = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "c3", messageId: "m3", mode: "everyone" } },
  {
    db: storageFail.db,
    deleteStoragePath: async () => {
      throw Object.assign(new Error("quota"), { code: "storage/retry-limit-exceeded" });
    },
  },
);
assert.equal(retryPending.ok, true);
assert.equal(retryPending.alreadyApplied, true);
assert.equal(retryPending.cleanupPending, true);
assert.equal(storageFail.store.get("chats/c3/deletedAttachments/m3").path, "chats/c3/pic.jpg");

const cleaned = await handleDeleteChatMessage(
  { auth: { uid: "uidA" }, data: { chatId: "c3", messageId: "m3", mode: "everyone" } },
  { db: storageFail.db, deleteStoragePath: storageFail.deleteStoragePath },
);
assert.equal(cleaned.ok, true);
assert.equal(cleaned.cleanupPending, false);
assert.equal(storageFail.store.get("chats/c3/deletedAttachments/m3"), undefined);

const otherAccount = client.queuedDeletesForIdentity(
  [
    { id: "a", chatId: "c1", messageId: "m1", mode: "everyone", identity: "uidA", attempts: 0 },
    { id: "b", chatId: "c2", messageId: "m2", mode: "me", identity: "uidB", attempts: 0 },
  ],
  "uidA",
);
assert.equal(otherAccount.length, 1);
assert.equal(otherAccount[0].id, "a");
assert.deepEqual(client.queuedDeletesForIdentity(otherAccount, ""), []);
assert.deepEqual(client.queuedDeletesForIdentity(otherAccount, "uidZ"), []);

console.log(JSON.stringify({ gate: "CHAT_MESSAGE_DELETE", pass: true }, null, 2));
