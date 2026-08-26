/**
 * Audio permission → recording → preview state machine.
 * Usage: node --experimental-strip-types scripts/chat-audio-capture.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const audio = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioCapture.ts")).href
);

let phase = "idle";
let decision = audio.reduceChatAudioEvent(phase, { type: "tap" });
assert.equal(decision.phase, "arming");
assert.equal(decision.startCapture, true);
phase = decision.phase;

decision = audio.reduceChatAudioEvent(phase, { type: "pointer-up" });
assert.equal(decision.phase, "arming");
assert.equal(decision.stopCapture, false);

decision = audio.reduceChatAudioEvent(phase, { type: "pointer-cancel" });
assert.equal(decision.phase, "arming");
assert.equal(decision.stopCapture, false);

decision = audio.reduceChatAudioEvent(phase, { type: "permission-denied" });
assert.equal(decision.phase, "idle");
assert.equal(decision.showDenied, true);
phase = decision.phase;

decision = audio.reduceChatAudioEvent(phase, { type: "tap" });
phase = decision.phase;
decision = audio.reduceChatAudioEvent(phase, { type: "stream-ready" });
assert.equal(decision.phase, "recording");
phase = decision.phase;

decision = audio.reduceChatAudioEvent(phase, { type: "tap" });
assert.equal(decision.stopCapture, true);
phase = decision.phase;

decision = audio.reduceChatAudioEvent(phase, { type: "blob-ready" });
assert.equal(decision.phase, "preview");
phase = decision.phase;

const playback = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioPlayback.ts")).href
);
const pcm = new Float32Array(32);
for (let i = 0; i < pcm.length; i += 1) pcm[i] = i % 2 === 0 ? 0.4 : -0.4;
const previewBlob = playback.encodePcmToWav([pcm], 16000);
const preview = await playback.preparePlayableChatAudio(previewBlob);
assert.equal(preview.prepared, "passthrough");
assert.ok(preview.blob.size > 44);
const receiverPlayed = [];
const receiver = await playback.playChatAudioBuffer("https://receiver/audio.wav", {
  fetchBuffer: async () => preview.blob.arrayBuffer(),
  decode: async () => ({
    duration: 1,
    start() {
      receiverPlayed.push("start");
    },
    stop() {
      receiverPlayed.push("stop");
    },
  }),
});
assert.deepEqual(receiverPlayed, ["start"]);
receiver.stop();
assert.equal(receiverPlayed.includes("stop"), true);

decision = audio.reduceChatAudioEvent(phase, { type: "tap" });
assert.equal(decision.startCapture, true);

assert.equal(audio.isChatAudioPermissionDenied({ name: "NotAllowedError" }), true);
assert.equal(audio.isChatAudioPermissionDenied({ message: "permission denied by webview" }), false);
// Native OS granted but WebView NotAllowedError → failed (no false permission banner).
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError" },
    { nativePlatform: true, denied: false },
  ),
  "failed",
);
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError" },
    { nativePlatform: true, denied: false, granted: true, permissionState: "granted" },
  ),
  "failed",
);
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError" },
    { nativePlatform: true, denied: true, permissionState: "denied" },
  ),
  "denied",
);
assert.equal(audio.CHAT_AUDIO_MIN_BYTES, 512);
assert.equal(typeof audio.pickSupportedAudioMimeType, "function");

const ids = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonChatId.ts")).href
);
assert.equal(
  ids.chatPageComposer("anon_sess1__anon_to__maria"),
  "profile-anon",
);
assert.equal(ids.chatPageComposer("legacy-thread-1"), "legacy");
assert.equal(
  ids.chatPageComposer(ids.buildProfileAnonChatId("anon_x", "maria")),
  "profile-anon",
);

decision = audio.reduceChatAudioEvent("recording", { type: "blob-too-small" });
assert.equal(decision.phase, "idle");
assert.equal(decision.showFailed, true);

console.log(JSON.stringify({ gate: "CHAT_AUDIO_CAPTURE", pass: true }, null, 2));
