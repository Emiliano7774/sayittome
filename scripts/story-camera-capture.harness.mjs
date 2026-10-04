/**
 * Stories camera: native/mobile capture input or Capacitor Camera, never
 * getUserMedia-first (Android WebView used to deny camera-only requests).
 * Usage: node --experimental-strip-types scripts/story-camera-capture.harness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const camera = read("src/components/stories/StoryLiveCamera.tsx");
const page = read("src/app/stories/new/page.tsx");
const policy = read("android/app/src/main/java/com/sayittome/app/MicCapturePolicy.java");
const mainActivity = read("android/app/src/main/java/com/sayittome/app/MainActivity.java");
const policyTest = read("android/app/src/test/java/com/sayittome/app/MicCapturePolicyTest.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");

assert.match(page, /<StoryLiveCamera/);
assert.match(page, /setCameraOpen\(true\)/);
assert.match(page, /sayittome-nav-scroll-spacer/);
assert.match(page, /data-story-new-nav-spacer/);
assert.match(page, /data-story-new-publish/);

assert.match(camera, /prefersChatCaptureFileInput\(\)/);
assert.match(camera, /captureChatPhotoFromCamera/);
assert.match(camera, /openChatFileInput/);
assert.match(camera, /if \(!open \|\| preferFileInput\) return/);
assert.match(camera, /capture="environment"/);
assert.match(camera, /accept="image\/\*"/);
assert.match(camera, /accept="video\/\*"/);
assert.match(camera, /data-story-camera-path/);
assert.match(camera, /CHAT_FILE_INPUT_CLASS/);
assert.match(camera, /sayittome-story-camera-open/);
assert.match(camera, /z-\[10050\]/);
assert.doesNotMatch(camera, /\[mode, onClose, open, t\]/);

const css = read("src/app/globals.css");
assert.match(css, /sayittome-story-camera-open/);
assert.match(css, /sayittome-nav-scroll-spacer/);

const gumStart = camera.indexOf("navigator.mediaDevices.getUserMedia");
assert.ok(gumStart > 0, "desktop live preview still uses getUserMedia");
assert.ok(
  camera.indexOf("if (!open || preferFileInput) return") < gumStart,
  "getUserMedia must not run on native/mobile capture-input path",
);

assert.match(manifest, /android\.permission\.CAMERA/);
assert.match(policy, /shouldGrantVideoCapture/);
assert.match(policy, /videoCaptureOnly/);
assert.match(policy, /requestsVideoCapture/);
assert.match(policyTest, /trustedOrigin_grantsVideoWhenOsGranted/);
assert.match(policyTest, /evilOrigin_isDeniedVideoEvenWhenOsGranted/);

const chromeClient = mainActivity.slice(mainActivity.indexOf("public void onPermissionRequest"));
assert.match(chromeClient, /shouldGrantVideoCapture/);
assert.match(chromeClient, /grantVideoCaptureOnly/);
assert.match(chromeClient, /launchCameraRequest/);
assert.doesNotMatch(chromeClient, /\|\| !wantsAudio/);
assert.doesNotMatch(chromeClient, /super\.onPermissionRequest/);
assert.doesNotMatch(mainActivity, /request\.grant\(resources/);
assert.doesNotMatch(mainActivity, /request\.grant\(request\.getResources/);

console.log(JSON.stringify({ gate: "STORY_CAMERA_CAPTURE", pass: true }, null, 2));
