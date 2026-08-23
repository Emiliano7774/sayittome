/**
 * Android RECORD_AUDIO: ask once on record, never on send, deny alert only on real denial.
 * Usage: node --experimental-strip-types scripts/chat-audio-android-permission.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const manifest = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const mainActivity = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/MainActivity.java"),
  "utf8",
);
const profileChat = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const legacyChat = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);

assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
assert.match(mainActivity, /SayItToMeMic/);
assert.match(mainActivity, /RequestPermission/);
assert.match(mainActivity, /RECORD_AUDIO/);
assert.match(mainActivity, /sayittome-app\.web\.app/);
assert.match(mainActivity, /isTrustedTopLevelOrigin/);
assert.match(mainActivity, /MicAwareChromeClient/);
assert.match(mainActivity, /pendingWebPermissionRequest/);
assert.match(mainActivity, /launchRecordAudioRequest/);
assert.match(mainActivity, /ACTION_APPLICATION_DETAILS_SETTINGS/);
assert.match(mainActivity, /shouldShowRequestPermissionRationale/);
assert.match(mainActivity, /openSettings/);
assert.match(mainActivity, /onResume/);
assert.match(mainActivity, /__sayittomeMicResume/);
assert.doesNotMatch(mainActivity, /MODIFY_AUDIO_SETTINGS/);
assert.doesNotMatch(mainActivity, /allowNavigation/);

const permissionRequestFn = mainActivity.slice(
  mainActivity.indexOf("public void onPermissionRequest"),
  mainActivity.lastIndexOf("super.onPermissionRequest"),
);
assert.match(permissionRequestFn, /RESOURCE_AUDIO_CAPTURE/);
assert.match(permissionRequestFn, /launchRecordAudioRequest/);
assert.equal(
  permissionRequestFn.includes("super.onPermissionRequest"),
  false,
  "audio-only getUserMedia must use the Activity RECORD_AUDIO launcher, not Capacitor super",
);

assert.match(profileChat, /ensureChatMicrophonePermission/);
assert.match(profileChat, /planChatMicrophoneStart/);
assert.match(profileChat, /classifyChatAudioCaptureFailure/);
assert.match(profileChat, /openChatMicrophoneSettings/);
assert.match(legacyChat, /ensureChatMicrophonePermission/);
assert.match(legacyChat, /openChatMicrophoneSettings/);
assert.doesNotMatch(profileChat, /alert\(t\("chat_mic_fail"\)\)/);
assert.doesNotMatch(profileChat, /alert\(t\("chat_mic_permission_denied"\)\)/);

const sendMedia = profileChat.slice(
  profileChat.indexOf("async function sendMedia()"),
  profileChat.indexOf("function closeDeleteMenu()"),
);
assert.equal(sendMedia.includes("ensureChatMicrophonePermission"), false);
assert.equal(sendMedia.includes("getUserMedia"), false);

const sendPending = legacyChat.slice(
  legacyChat.indexOf("const sendPendingAudio"),
  legacyChat.indexOf("const startRecording"),
);
assert.equal(sendPending.includes("ensureChatMicrophonePermission"), false);
assert.equal(sendPending.includes("getUserMedia"), false);

const recordStart = profileChat.slice(
  profileChat.indexOf("async function startAudioRecording()"),
  profileChat.indexOf("function stopAudioRecording()"),
);
assert.ok(
  recordStart.indexOf("ensureChatMicrophonePermission") < recordStart.indexOf("getUserMedia"),
  "native RECORD_AUDIO must be requested before getUserMedia",
);
assert.doesNotMatch(recordStart, /permisos del navegador/);
assert.doesNotMatch(recordStart, /alert\(t\("chat_mic/);

const legacyRecordStart = legacyChat.slice(
  legacyChat.indexOf("const startRecording"),
  legacyChat.indexOf("const stopRecording"),
);
assert.doesNotMatch(legacyRecordStart, /permisos del navegador/);
assert.doesNotMatch(legacyRecordStart, /alert\(/);

const mic = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatMicrophonePermission.ts")).href
);
const audio = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioCapture.ts")).href
);

assert.equal(mic.isRealChatMicrophoneDenial({ nativeDenied: true }), true);
assert.equal(
  mic.isRealChatMicrophoneDenial({
    error: { name: "NotAllowedError" },
    nativePlatform: true,
  }),
  true,
);
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError", message: "Permission denied" },
    { nativePlatform: true, denied: false },
  ),
  "denied",
);
assert.equal(
  mic.noticeFromCaptureFailure({ classified: "failed", permissionState: "prompt" }),
  "denied",
);
assert.equal(
  mic.noticeFromCaptureFailure({ classified: "failed", permissionState: "granted" }),
  "failed",
);

assert.deepEqual(mic.planChatMicrophoneStart({ native: false, bridgeState: "prompt" }), {
  requestNative: false,
  startCapture: true,
  notice: null,
  openSettings: false,
});
assert.deepEqual(mic.planChatMicrophoneStart({ native: true, bridgeState: "prompt" }), {
  requestNative: true,
  startCapture: false,
  notice: null,
  openSettings: false,
});
assert.deepEqual(mic.planChatMicrophoneStart({ native: true, bridgeState: "granted" }), {
  requestNative: false,
  startCapture: true,
  notice: null,
  openSettings: false,
});
assert.deepEqual(mic.planChatMicrophoneStart({ native: true, bridgeState: "denied" }), {
  requestNative: false,
  startCapture: false,
  notice: "denied",
  openSettings: false,
});
assert.deepEqual(mic.planChatMicrophoneStart({ native: true, bridgeState: "blocked" }), {
  requestNative: false,
  startCapture: false,
  notice: "blocked",
  openSettings: true,
});
assert.deepEqual(mic.planChatMicrophoneStart({ native: true, bridgeState: "missing" }), {
  requestNative: false,
  startCapture: true,
  notice: null,
  openSettings: false,
});
assert.equal(
  mic.noticeFromMicrophonePermission({
    allowed: false,
    denied: true,
    blocked: true,
    state: "blocked",
  }),
  "blocked",
);

const granted = await mic.ensureChatMicrophonePermission();
if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
  assert.equal(granted.allowed, true);
  assert.equal(granted.denied, false);
} else {
  assert.equal(granted.denied, false);
}

assert.equal(mic.TRUSTED_MIC_ORIGIN, "https://sayittome-app.web.app");
assert.equal(mic.isTrustedTopLevelMicrophoneContext(undefined), false);

const iframeWin = {
  top: {},
  location: { origin: "https://sayittome-app.web.app" },
};
iframeWin.top = { other: true };
assert.equal(mic.isTrustedTopLevelMicrophoneContext(iframeWin), false);

const trustedWin = { location: { origin: "https://sayittome-app.web.app" } };
trustedWin.top = trustedWin;
assert.equal(mic.isTrustedTopLevelMicrophoneContext(trustedWin), true);

const otherOrigin = { location: { origin: "https://evil.example" } };
otherOrigin.top = otherOrigin;
assert.equal(mic.isTrustedTopLevelMicrophoneContext(otherOrigin), false);

mic.resetChatMicrophonePermissionSession();

console.log(JSON.stringify({ gate: "CHAT_AUDIO_ANDROID_PERMISSION", pass: true }, null, 2));
