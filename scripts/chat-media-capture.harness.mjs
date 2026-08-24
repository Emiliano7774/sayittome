/**
 * Camera / gallery / video capture gates — imports production helpers.
 * Usage: node --experimental-strip-types scripts/chat-media-capture.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const media = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatMediaCapture.ts")).href
);

assert.equal(media.classifyChatMediaFailure({ message: "User cancelled photos app" }), "cancelled");
assert.equal(media.classifyChatMediaFailure({ message: "No image picked" }), "cancelled");
assert.equal(
  media.classifyChatMediaFailure(Object.assign(new Error("aborted"), { name: "AbortError" })),
  "cancelled",
);
assert.equal(
  media.classifyChatMediaFailure(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })),
  "denied",
);
assert.equal(media.classifyChatMediaFailure(new Error("boom")), "failed");

assert.equal(media.openChatFileInput(null), false);
assert.equal(media.openNativeGalleryFilePicker(null), false);

const clicked = { value: "stale", clickCount: 0, click() { this.clickCount += 1; } };
assert.equal(media.openChatFileInput(clicked), true);
assert.equal(clicked.value, "");
assert.equal(clicked.clickCount, 1);

const galleryPerm = await media.ensureChatMediaPermission("gallery");
assert.equal(galleryPerm, true, "gallery must never require READ_MEDIA / photos permission");

const video = media.fileFromChatInput(
  new File(["x"], "clip.mp4", { type: "video/mp4" }),
  "gallery",
);
assert.equal(video?.type, "video");
assert.equal(video?.source, "gallery");

const photo = media.fileFromChatInput(
  new File(["x"], "shot.jpg", { type: "image/jpeg" }),
  "camera",
);
assert.equal(photo?.type, "image");
assert.equal(photo?.source, "camera");
assert.equal(media.fileFromChatInput(null, "gallery"), null);
assert.equal(typeof media.CHAT_FILE_INPUT_CLASS, "string");
assert.equal(media.CHAT_FILE_INPUT_CLASS.split(/\s+/).includes("hidden"), false);
assert.equal(media.CHAT_FILE_INPUT_CLASS.includes("opacity-0"), true);
assert.equal(media.CHAT_FILE_INPUT_CLASS.includes("fixed"), true);
assert.equal(media.CHAT_FILE_INPUT_CLASS.includes("absolute"), false);

// Mobile UA → capture input path (no getUserMedia-first).
const prevUa = globalThis.navigator?.userAgent;
Object.defineProperty(globalThis.navigator, "userAgent", {
  configurable: true,
  get: () =>
    "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
});
assert.equal(media.prefersChatCaptureFileInput(), true);
Object.defineProperty(globalThis.navigator, "userAgent", {
  configurable: true,
  get: () => prevUa || "NodeHarness",
});

assert.equal(typeof (await media.ensureChatMicrophonePermission()), "boolean");
assert.equal(await media.ensureChatCameraStreamPermission(true), true);
assert.equal(await media.isChatCameraPermissionStickyDenied(), false);

// Bomb still keys off camera source from capture-input files.
assert.equal(photo?.source, "camera");

console.log(JSON.stringify({ gate: "CHAT_MEDIA_CAPTURE", pass: true }, null, 2));
