/**
 * Session restore + notification identity/permission structural gates.
 * Usage: node scripts/session-notify-restore.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const homePage = fs.readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const restore = fs.readFileSync(
  path.join(root, "src/components/home/HomeSessionRestore.tsx"),
  "utf8",
);
const postAuth = fs.readFileSync(path.join(root, "src/lib/auth/postAuthRedirect.ts"), "utf8");
const enterAnon = fs.readFileSync(path.join(root, "src/lib/auth/enterAnonymousMode.ts"), "utf8");
const settings = fs.readFileSync(path.join(root, "src/app/settings/page.tsx"), "utf8");
const fcm = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");
const notif = fs.readFileSync(path.join(root, "src/lib/chat/chatNotifications.ts"), "utf8");
const prompt = fs.readFileSync(
  path.join(root, "src/components/chat/ChatNotificationPrompt.tsx"),
  "utf8",
);
const setting = fs.readFileSync(
  path.join(root, "src/components/chat/ChatNotificationSetting.tsx"),
  "utf8",
);
const functionsSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const cap = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");

assert.match(homePage, /HomeSessionRestore/);
assert.match(restore, /auth\.authStateReady\(\)/);
assert.match(restore, /resolvePostAuthPath/);
assert.match(restore, /data-home-session-restore/);
assert.match(postAuth, /COMPLETE_POST_AUTH_PATH = \"\/shuffle\"/);
assert.match(postAuth, /return COMPLETE_POST_AUTH_PATH/);
assert.match(enterAnon, /isIncompleteAuthDestination/);
assert.match(enterAnon, /deleteCurrentDeviceFcmToken/);
assert.match(settings, /next\.startsWith\(\"\/register\"\)/);
assert.doesNotMatch(settings, /next !== \"\/settings\"/);

assert.match(fcm, /PERSISTED_TOKEN_KEY/);
assert.match(fcm, /persistDeviceToken/);
assert.match(fcm, /readPersistedDeviceToken/);
assert.match(notif, /force\?: boolean/);
assert.match(notif, /resetChatNotificationPermissionLatch/);
assert.match(prompt, /completeChatNotificationPrompt\(false\)/);
assert.match(prompt, /setChatNotificationsEnabled\(false\)/);
assert.match(setting, /deleteCurrentDeviceFcmToken/);
assert.match(setting, /force: true/);

assert.match(functionsSrc, /from\.startsWith\(\"anon_\"\)/);
assert.match(functionsSrc, /isOwnerReply\(message, chat, from\)/);
assert.match(cap, /presentationOptions: \[\"badge\"\]/);

console.log(JSON.stringify({ gate: "SESSION_NOTIFY_RESTORE", pass: true }, null, 2));
