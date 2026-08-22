/**
 * Audible preview MIME, WAV encode, ObjectURL lifecycle, extension, fallback stop.
 * Usage: node --experimental-strip-types scripts/chat-audio-playback.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const audio = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioPlayback.ts")).href
);

const webm = audio.inspectChatAudioBlob({ type: "audio/webm;codecs=opus", size: 2048 });
assert.equal(webm.codec, "opus");
assert.equal(webm.htmlLikely, false);

const mp4 = audio.inspectChatAudioBlob({ type: "audio/mp4", size: 2048 });
assert.equal(mp4.codec, "aac");
assert.equal(mp4.htmlLikely, true);

assert.equal(audio.chatAudioExtension("audio/mpeg"), "mp3");
assert.equal(audio.chatAudioExtension("audio/mp3"), "mp3");
assert.notEqual(audio.chatAudioExtension("audio/mpeg"), "m4a");
assert.equal(audio.chatAudioExtension("audio/mp4"), "m4a");
assert.equal(audio.chatAudioExtension("audio/wav"), "wav");
assert.equal(audio.chatAudioExtension("audio/webm;codecs=opus"), "webm");

const pcm = new Float32Array(16);
for (let i = 0; i < pcm.length; i += 1) pcm[i] = i % 2 === 0 ? 0.2 : -0.2;
const wav = audio.encodePcmToWav([pcm], 16000);
assert.equal(wav.type, "audio/wav");
assert.ok(wav.size > 44);
const header = new Uint8Array(await wav.arrayBuffer());
assert.equal(String.fromCharCode(...header.slice(0, 4)), "RIFF");
assert.equal(String.fromCharCode(...header.slice(8, 12)), "WAVE");

const created = [];
const revoked = [];
const tracked = audio.createChatAudioObjectUrl(
  (blob) => {
    const url = `blob:${created.length}:${blob.size}`;
    created.push(url);
    return url;
  },
  (url) => revoked.push(url),
);
const first = tracked.replace(wav);
assert.equal(first, tracked.url);
const second = tracked.replace(wav);
assert.equal(revoked[0], first);
assert.equal(second, tracked.url);
tracked.revoke();
assert.equal(revoked[1], second);
assert.equal(tracked.url, "");

const preparedPassthrough = await audio.preparePlayableChatAudio(wav);
assert.equal(preparedPassthrough.prepared, "passthrough");

const preparedWav = await audio.preparePlayableChatAudio(
  { type: "audio/webm;codecs=opus", size: 1024 },
  {
    decode: async () => ({ sampleRate: 16000, channelData: [pcm] }),
  },
);
assert.equal(preparedWav.prepared, "wav");
assert.equal(preparedWav.mime, "audio/wav");

let ended = false;
const fallback = await audio.playChatAudioBuffer("blob:test", {
  fetchBuffer: async () => new ArrayBuffer(8),
  decode: async () => ({
    duration: 1,
    start() {},
    stop() {
      ended = true;
    },
  }),
  onEnded: () => {
    ended = true;
  },
});
fallback.stop();
assert.equal(ended, true);

assert.equal(audio.pickPreferredChatAudioMimeType((type) => type === "audio/mp4"), "audio/mp4");
assert.equal(
  audio.pickPreferredChatAudioMimeType((type) => type.includes("webm")),
  "audio/webm;codecs=opus",
);

const capture = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioCapture.ts")).href
);
assert.equal(typeof capture.pickSupportedAudioMimeType, "function");

console.log(JSON.stringify({ gate: "CHAT_AUDIO_PLAYBACK", pass: true }, null, 2));
