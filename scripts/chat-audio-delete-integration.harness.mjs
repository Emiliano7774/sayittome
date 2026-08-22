/**
 * Integration gate: production wiring in both chats + callable + confirmation.
 * Usage: node --experimental-strip-types scripts/chat-audio-delete-integration.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const profileChat = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const legacyChat = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);
const deleteMenu = fs.readFileSync(
  path.join(root, "src/components/chat/ChatMessageDeleteMenu.tsx"),
  "utf8",
);
const callable = fs.readFileSync(
  path.join(root, "functions/src/deleteChatMessage.ts"),
  "utf8",
);
const callableCore = fs.readFileSync(
  path.join(root, "functions/src/deleteChatMessageCore.ts"),
  "utf8",
);
const persist = fs.readFileSync(
  path.join(root, "src/lib/chat/persistMessageDelete.ts"),
  "utf8",
);

function mustInclude(source, label, snippets) {
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `${label} missing ${snippet}`);
  }
}

mustInclude(profileChat, "ProfileAnonChat", [
  "ChatAudioPlayer",
  "preparePlayableChatAudio",
  "ChatMessageLongPress",
  "ChatMessageDeleteMenu",
  "persistMessageDelete",
  "chat_delete_confirm_me",
  "chat_delete_confirm_everyone",
  'message.type === "audio"',
  "message.storyReply",
  'message.type === "image"',
  'message.type === "video"',
  "ChatMessageText",
  "readQueuedMessageDeletes(firebaseUid)",
  "cleanupPending",
]);

mustInclude(legacyChat, "legacy-chat", [
  "ChatAudioPlayer",
  "preparePlayableChatAudio",
  "ChatMessageLongPress",
  "ChatMessageDeleteMenu",
  "persistMessageDelete",
  "pendingAudio",
  "Descartar",
  "mediaType === \"audio\"",
  "startReply",
]);

mustInclude(deleteMenu, "ChatMessageDeleteMenu", [
  'stage === "choose"',
  "confirm-me",
  "confirm-everyone",
  "canDeleteForEveryone",
]);

mustInclude(callable, "deleteChatMessage callable", [
  "request.auth",
  "CHAT_ROOT_COLLECTIONS",
  "MESSAGE_SUBCOLLECTIONS",
  "runTransaction",
  "deleteStoragePath",
  "previousMediaUrl",
  "FieldValue.delete()",
  "deletedAttachments",
  "pickUniqueChatMessageLocation",
  "storage()",
  "cleanupPending",
]);
assert.equal(callable.includes("storage_delete_failed"), false);
mustInclude(callableCore, "deleteChatMessageCore", [
  "chats_anonimos",
  "mensajes",
  "messages",
  "solicitanteUid",
  "destinatarioUid",
]);

const adminApp = fs.readFileSync(
  path.join(root, "functions/src/adminApp.ts"),
  "utf8",
);
const indexSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
mustInclude(adminApp, "adminApp", [
  "getApp()",
  "initializeApp()",
  "getFirestore(ensureAdminApp())",
  "getStorage(ensureAdminApp())",
]);
assert.equal(adminApp.includes("if (!getApps().length)"), false);
assert.equal(/getFirestore\(\s*\)/.test(indexSrc), false);
assert.equal(indexSrc.includes("db: db()"), true);

mustInclude(persist, "persistMessageDelete", [
  "httpsCallable",
  "DELETE_CHAT_MESSAGE_CALLABLE",
  "ensureStorageAuth",
  "FUNCTIONS_REGION",
]);
assert.equal(persist.includes("isLatest"), false);
assert.equal(persist.includes("mine:"), false);
assert.equal(persist.includes("previousMediaUrl"), false);

const persistMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/persistMessageDelete.ts")).href
);
const firebaseMod = await import(
  pathToFileURL(path.join(root, "src/lib/firebase.ts")).href
);
assert.equal(persistMod.DELETE_CHAT_MESSAGE_CALLABLE, "deleteChatMessage");
assert.equal(firebaseMod.FUNCTIONS_REGION, "us-central1");
assert.equal(persistMod.DELETE_CHAT_MESSAGE_REGION, firebaseMod.FUNCTIONS_REGION);

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const compiledCore = require(path.join(root, "functions/lib/deleteChatMessageCore.js"));
const compiledHandler = require(path.join(root, "functions/lib/deleteChatMessage.js"));
const compiledIndex = require(path.join(root, "functions/lib/index.js"));

assert.equal(typeof compiledCore.decideChatMessageDelete, "function");
assert.equal(typeof compiledCore.isChatMember, "function");
assert.equal(typeof compiledCore.pickUniqueChatMessageLocation, "function");
assert.deepEqual(compiledCore.CHAT_ROOT_COLLECTIONS, ["chats", "chats_anonimos"]);
assert.deepEqual(compiledCore.MESSAGE_SUBCOLLECTIONS, ["mensajes", "messages"]);
assert.equal(typeof compiledHandler.handleDeleteChatMessage, "function");
assert.equal(typeof compiledHandler.resolveChatMessageLocation, "function");
assert.equal(typeof compiledIndex.deleteChatMessage, "function");
assert.equal(typeof compiledIndex.ensureAdminApp, "function");
assert.equal(typeof compiledIndex.resolveAdminApp, "function");
assert.equal(typeof compiledIndex.db, "function");
assert.equal(typeof compiledIndex.handleDeleteChatMessage, "function");
assert.equal(typeof compiledIndex.decideChatMessageDelete, "function");
assert.equal(typeof compiledIndex.isChatMember, "function");
assert.equal(compiledIndex.handleDeleteChatMessage, compiledHandler.handleDeleteChatMessage);

const stranger = compiledCore.decideChatMessageDelete({
  uid: "intruder",
  mode: "me",
  chatId: "c1",
  messageId: "m1",
  chat: { participantes: ["owner", "peer"], targetUid: "owner" },
  message: { fromUid: "owner", senderAuthUid: "owner" },
});
assert.equal(stranger.ok, false);
assert.equal(stranger.error, "permission-denied");

const latest = compiledCore.decideChatMessageDelete({
  uid: "owner",
  mode: "everyone",
  chatId: "c1",
  messageId: "m1",
  chat: { latestMessageId: "m1", lastMessage: "foto" },
  message: {
    fromUid: "owner",
    senderAuthUid: "owner",
    mediaUrl: "https://firebasestorage.googleapis.com/v0/b/b/o/chats%2Fc1%2Fx.wav?alt=media",
  },
});
assert.equal(latest.ok, true);
assert.equal(latest.summary.lastMessage, "Mensaje eliminado");
assert.equal(latest.storagePath, "chats/c1/x.wav");
assert.equal(compiledCore.isQuietEveryoneDeleteSummary(latest.summary), true);

const idempotent = compiledCore.decideChatMessageDelete({
  uid: "owner",
  mode: "everyone",
  chatId: "c1",
  messageId: "m1",
  chat: { latestMessageId: "m1" },
  message: { fromUid: "owner", senderAuthUid: "owner", deletedForEveryone: true },
});
assert.equal(idempotent.alreadyApplied, true);

const playback = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioPlayback.ts")).href
);
assert.equal(playback.chatAudioExtension("audio/mp3"), "mp3");

console.log(JSON.stringify({ gate: "CHAT_AUDIO_DELETE_INTEGRATION", pass: true }, null, 2));
