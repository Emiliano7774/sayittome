/**
 * FCM push pipeline structural + recipient/title invariants.
 * Usage: node scripts/fcm-push-pipeline.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Prefer compiled JS if present, else mirror logic inline for CI-before-build.
let resolvePushRecipientUids;
let notificationTitleForRecipient;
let notificationBodyFromMessage;

const compiled = path.join(root, "functions/lib/index.js");
if (fs.existsSync(compiled)) {
  const mod = require(compiled);
  resolvePushRecipientUids = mod.resolvePushRecipientUids;
  notificationTitleForRecipient = mod.notificationTitleForRecipient;
  notificationBodyFromMessage = mod.notificationBodyFromMessage;
} else {
  resolvePushRecipientUids = (message, chat) => {
    const from = String(message.fromUid || message.ownerId || "").trim();
    const isOwner =
      message.senderKind === "profile" ||
      from.startsWith("profile_") ||
      (chat.targetUid && from === chat.targetUid);
    const out = new Set();
    if (!isOwner) {
      for (const key of [chat.targetUid, chat.receptorUid, chat.anonOwnerUid]) {
        const uid = String(key || "").trim();
        if (uid && !uid.startsWith("anon_") && !uid.startsWith("profile_")) out.add(uid);
      }
    } else if (chat.initiatorUid && !String(chat.initiatorUid).startsWith("anon_")) {
      out.add(String(chat.initiatorUid));
    }
    out.delete(from);
    return [...out];
  };
  notificationTitleForRecipient = (message, chat) => {
    const from = String(message.fromUid || "").trim();
    if (from.startsWith("anon_")) {
      const parts = from.split("_").filter(Boolean);
      const token = parts[1] || "anon";
      return `Anon-${token.slice(0, 10)}`;
    }
    return String(chat.targetUsername || "Nuevo mensaje");
  };
  notificationBodyFromMessage = (message) =>
    String(message.texto || message.text || "").trim() || "Nuevo mensaje";
}

const OWNER = "ownerUidABC";
const ANON = "anon_deadbeef01";

assert.deepEqual(
  resolvePushRecipientUids(
    { fromUid: ANON, senderKind: "anon", texto: "hola" },
    { targetUid: OWNER, receptorUid: OWNER, participantes: [ANON, OWNER] },
  ),
  [OWNER],
  "anon→profile notifies owner uid",
);

assert.deepEqual(
  resolvePushRecipientUids(
    { fromUid: `profile_${OWNER}`, senderKind: "profile", profileUid: OWNER, texto: "reply" },
    { targetUid: OWNER, initiatorUid: "", participantes: [ANON, OWNER] },
  ),
  [],
  "profile→anon without firebase initiator skips FCM",
);

assert.equal(
  notificationTitleForRecipient(
    { fromUid: ANON, senderKind: "anon" },
    { targetUid: OWNER, targetUsername: "alice" },
    OWNER,
  ),
  "Anon-deadbeef01",
);

assert.equal(
  notificationTitleForRecipient(
    { fromUid: "AbCdEfGhIjKlMnOpQrStUv", senderRole: "anon", senderKind: "anon" },
    { targetUid: OWNER, targetUsername: "alice" },
    OWNER,
  ),
  "Anon",
);

assert.equal(
  notificationBodyFromMessage({ texto: "", mediaUrl: "x" }),
  "Nuevo mensaje",
);

const srcIndex = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(srcIndex, /onChatMessageCreated/);
assert.match(srcIndex, /pushDeliveries/);
assert.match(srcIndex, /registerFcmToken/);
assert.match(srcIndex, /chat-messages-v2/);

const client = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");
assert.match(client, /initNativePushNotifications/);
assert.match(client, /pushNotificationActionPerformed/);
assert.match(client, /unregisterFcmToken|deleteCurrentDeviceFcmToken/);
assert.match(client, /enableNativeChatPush/);
assert.match(client, /waitForRegisteredFcmToken/);
assert.match(client, /openNativeNotificationSettings/);

const logout = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
assert.match(logout, /deleteCurrentDeviceFcmToken/);

const menu = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
assert.match(menu, /data-profile-option="notifications"/);
assert.match(menu, /<Bell /);

const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
assert.ok(Array.isArray(firebaseJson.functions));
assert.equal(firebaseJson.functions[0].source, "functions");

assert.ok(fs.existsSync(path.join(root, "android/app/google-services.json")));
assert.ok(fs.existsSync(path.join(root, "android/app/src/main/res/raw/whip.mp3")));

const gs = JSON.parse(
  fs.readFileSync(path.join(root, "android/app/google-services.json"), "utf8"),
);
assert.ok(
  gs.client.some((c) => c.client_info?.android_client_info?.package_name === "com.sayittome.app"),
);

console.log(
  JSON.stringify(
    {
      gate: "FCM_PUSH_PIPELINE",
      compiled: fs.existsSync(compiled),
      pass: true,
    },
    null,
    2,
  ),
);
