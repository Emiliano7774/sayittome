/**
 * Android mic WebView wiring: trusted origin AUDIO_CAPTURE only.
 * Usage: node --experimental-strip-types scripts/android-mic-webview-wiring.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

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
const policy = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/MicCapturePolicy.java"),
  "utf8",
);
const capConfig = JSON.parse(
  fs.readFileSync(path.join(root, "android/app/src/main/assets/capacitor.config.json"), "utf8"),
);

assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
assert.equal(capConfig.appId, "com.sayittome.app");
assert.equal(capConfig.server?.url, "https://sayittome-app.web.app");
assert.equal(capConfig.server?.androidScheme, "https");
assert.equal(capConfig.server?.cleartext, false);

assert.match(policy, /TRUSTED_HOST = "sayittome-app\.web\.app"/);
assert.match(policy, /TRUSTED_ORIGIN = "https:\/\/sayittome-app\.web\.app"/);
assert.match(policy, /PermissionRequest\.RESOURCE_AUDIO_CAPTURE/);
assert.match(policy, /shouldGrantAudioCapture/);
assert.match(policy, /shouldDenyRequest/);
assert.doesNotMatch(policy, /RESOURCE_VIDEO_CAPTURE/);
assert.doesNotMatch(policy, /grant\(resources\)/);

assert.match(mainActivity, /class MicAwareChromeClient extends BridgeWebChromeClient/);
assert.match(mainActivity, /MicCapturePolicy\.shouldGrantAudioCapture/);
assert.match(mainActivity, /MicCapturePolicy\.shouldDenyRequest/);
assert.match(mainActivity, /grantAudioCaptureOnly/);
assert.match(mainActivity, /audioCaptureOnly\(\)/);
assert.match(mainActivity, /attachMicrophoneCapture/);
assert.match(mainActivity, /micChromeClient == null/);
assert.match(mainActivity, /new MicAwareChromeClient\(bridge\)/);
const resumeFn = mainActivity.slice(
  mainActivity.indexOf("public void onResume"),
  mainActivity.indexOf("private WebView webViewOrNull"),
);
assert.equal(
  resumeFn.includes("new MicAwareChromeClient"),
  false,
  "BridgeWebChromeClient must not registerForActivityResult after STARTED",
);
assert.match(mainActivity, /SayItToMeMic/);
assert.doesNotMatch(mainActivity, /super\.onPermissionRequest/);
assert.doesNotMatch(mainActivity, /request\.grant\(resources/);
assert.doesNotMatch(mainActivity, /request\.grant\(request\.getResources/);

const chromeClient = mainActivity.slice(mainActivity.indexOf("public void onPermissionRequest"));
assert.match(chromeClient, /shouldDenyRequest/);
assert.match(chromeClient, /shouldGrantAudioCapture/);
assert.match(chromeClient, /grantAudioCaptureOnly/);
assert.match(chromeClient, /launchRecordAudioRequest/);
assert.equal(chromeClient.includes("RESOURCE_VIDEO_CAPTURE"), false);
assert.equal(chromeClient.includes("super.onPermissionRequest"), false);

const mic = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatMicrophonePermission.ts")).href
);
const audio = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioCapture.ts")).href
);

assert.equal(mic.TRUSTED_MIC_ORIGIN, "https://sayittome-app.web.app");
assert.equal(
  mic.noticeFromCaptureFailure({ classified: "denied", permissionState: "granted" }),
  "failed",
);
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError" },
    { nativePlatform: true, granted: true, permissionState: "granted" },
  ),
  "failed",
);

const sdk = "C:\\Users\\emibe\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
let adb = { available: false, devices: [], recordAudio: null, appops: null, versionCode: null };
if (fs.existsSync(sdk)) {
  const devices = spawnSync(sdk, ["devices"], { encoding: "utf8" });
  const lines = String(devices.stdout || "")
    .split(/\r?\n/)
    .filter((line) => /\tdevice$/.test(line));
  adb.available = true;
  adb.devices = lines.map((line) => line.split("\t")[0]);
  if (adb.devices.length) {
    const pkg = spawnSync(sdk, ["shell", "dumpsys", "package", "com.sayittome.app"], {
      encoding: "utf8",
    });
    const pkgOut = String(pkg.stdout || "");
    const version = pkgOut.match(/versionCode=(\d+)/);
    const record = pkgOut.match(/android\.permission\.RECORD_AUDIO: granted=(true|false)/);
    adb.versionCode = version ? Number(version[1]) : null;
    adb.recordAudio = record ? record[1] : null;
    const ops = spawnSync(sdk, ["shell", "appops", "get", "com.sayittome.app", "RECORD_AUDIO"], {
      encoding: "utf8",
    });
    adb.appops = String(ops.stdout || "").trim();
  }
}

const mergedCandidates = [
  path.join(
    root,
    "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml",
  ),
  path.join(
    root,
    "android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml",
  ),
  path.join(root, "android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml"),
  path.join(root, "android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml"),
];
const mergedPath = mergedCandidates.find((candidate) => fs.existsSync(candidate)) || "";
let mergedRecordAudio = false;
if (mergedPath) {
  const merged = fs.readFileSync(mergedPath, "utf8");
  mergedRecordAudio = /android\.permission\.RECORD_AUDIO/.test(merged);
}

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_MIC_WEBVIEW_WIRING",
      pass: true,
      adb,
      mergedManifest: mergedPath
        ? { path: mergedPath, recordAudio: mergedRecordAudio }
        : { path: null, recordAudio: null, note: "assemble to materialize merged manifest" },
    },
    null,
    2,
  ),
);
