/**
 * Android mic WebView wiring: trusted-origin AUDIO_CAPTURE only, UI-thread grant,
 * MicAware reinstall before getUserMedia, no PermissionRequest hold across OS dialog.
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
const policyTest = fs.readFileSync(
  path.join(root, "android/app/src/test/java/com/sayittome/app/MicCapturePolicyTest.java"),
  "utf8",
);
const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const capConfig = JSON.parse(
  fs.readFileSync(
    path.join(root, "android/app/src/main/assets/capacitor.config.json"),
    "utf8",
  ),
);

assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
assert.equal(capConfig.appId, "com.sayittome.app");
assert.equal(capConfig.server?.url, "https://sayittome-app.web.app");
assert.equal(capConfig.server?.androidScheme, "https");
assert.equal(capConfig.server?.cleartext, false);

assert.match(gradle, /versionCode\s+122/);
assert.match(gradle, /versionName\s+"1\.0\.10"/);
assert.match(gradle, /org\.robolectric:robolectric/);

assert.match(policy, /TRUSTED_HOST = "sayittome-app\.web\.app"/);
assert.match(policy, /TRUSTED_ORIGIN = "https:\/\/sayittome-app\.web\.app"/);
assert.match(policy, /PermissionRequest\.RESOURCE_AUDIO_CAPTURE/);
assert.match(policy, /shouldGrantAudioCapture/);
assert.match(policy, /shouldDenyRequest/);
assert.match(policy, /audioCaptureOnly/);
assert.match(policy, /requestsAudioCapture/);
assert.doesNotMatch(policy, /RESOURCE_VIDEO_CAPTURE/);
assert.doesNotMatch(policy, /grant\(resources\)/);

assert.match(policyTest, /evil\.example/);
assert.match(policyTest, /evilOrigin_isDeniedEvenWhenOsGranted/);
assert.match(policyTest, /shouldDenyRequest/);
assert.match(policyTest, /shouldGrantAudioCapture/);

assert.match(mainActivity, /class MicAwareChromeClient extends BridgeWebChromeClient/);
assert.match(mainActivity, /ensureMicAwareChromeClientInstalled/);
assert.match(mainActivity, /MicCapturePolicy\.shouldGrantAudioCapture/);
assert.match(mainActivity, /MicCapturePolicy\.shouldDenyRequest/);
assert.match(mainActivity, /grantAudioCaptureOnly/);
assert.match(mainActivity, /audioCaptureOnly\(\)/);
assert.match(mainActivity, /attachMicrophoneCapture/);
assert.match(mainActivity, /micChromeClient == null/);
assert.match(mainActivity, /new MicAwareChromeClient\(/);
assert.match(mainActivity, /SayItToMeMic/);
assert.match(mainActivity, /__sayittomeMicPermissionResult/);
assert.match(mainActivity, /__sayittomeMicResume/);
assert.match(mainActivity, /getMainLooper/);
assert.match(mainActivity, /CountDownLatch/);
assert.match(mainActivity, /Do not hold PermissionRequest/);
assert.match(mainActivity, /Keep MicAware chrome client installed/);
assert.match(mainActivity, /Reinstall MicAware on UI thread just before JS getUserMedia/);
assert.doesNotMatch(mainActivity, /pendingWebPermissionRequest/);
assert.doesNotMatch(mainActivity, /super\.onPermissionRequest/);
assert.doesNotMatch(mainActivity, /request\.grant\(resources/);
assert.doesNotMatch(mainActivity, /request\.grant\(request\.getResources/);

const checkStart = mainActivity.indexOf("public String check()");
const checkEnd = mainActivity.indexOf("public void request(", checkStart);
assert.ok(checkStart >= 0 && checkEnd > checkStart, "MicrophoneBridge.check must exist");
const checkFn = mainActivity.slice(checkStart, checkEnd);
assert.match(checkFn, /runOnUiThread/);
assert.match(checkFn, /ensureMicAwareChromeClientInstalled/);
assert.match(checkFn, /CountDownLatch/);

const requestStart = mainActivity.indexOf("public void request(");
const requestEnd = mainActivity.indexOf("public void openSettings(", requestStart);
assert.ok(requestStart >= 0 && requestEnd > requestStart, "MicrophoneBridge.request must exist");
const requestFn = mainActivity.slice(requestStart, requestEnd);
assert.match(requestFn, /runOnUiThread/);
assert.match(requestFn, /ensureMicAwareChromeClientInstalled/);

const openSettingsStart = mainActivity.indexOf("public void openSettings(");
const openSettingsEnd = mainActivity.indexOf("private class MicAwareChromeClient", openSettingsStart);
assert.ok(openSettingsStart >= 0 && openSettingsEnd > openSettingsStart);
const openSettingsFn = mainActivity.slice(openSettingsStart, openSettingsEnd);
assert.match(openSettingsFn, /runOnUiThread/);
assert.ok(
  openSettingsFn.indexOf("runOnUiThread") < openSettingsFn.indexOf("isTrustedTopLevelOrigin"),
  "openSettings origin check must run on UI thread",
);

const resumeStart = mainActivity.indexOf("public void onResume");
const resumeEnd = Math.min(
  ...[
    mainActivity.indexOf("private WebView webViewOrNull"),
    mainActivity.indexOf("private Uri topLevelWebViewUri"),
    mainActivity.indexOf("private void ensureMicAwareChromeClientInstalled"),
  ].filter((i) => i > resumeStart),
);
const resumeFn = mainActivity.slice(resumeStart, resumeEnd);
assert.equal(
  resumeFn.includes("new MicAwareChromeClient"),
  false,
  "BridgeWebChromeClient must not registerForActivityResult after STARTED",
);
assert.match(resumeFn, /ensureMicAwareChromeClientInstalled\(\)/);

const chromeClient = mainActivity.slice(
  mainActivity.indexOf("public void onPermissionRequest"),
);
assert.match(chromeClient, /shouldDenyRequest/);
assert.match(chromeClient, /shouldGrantAudioCapture/);
assert.match(chromeClient, /grantAudioCaptureOnly/);
assert.match(chromeClient, /runOnUiThread/);
assert.match(chromeClient, /launchRecordAudioRequest/);
assert.match(chromeClient, /Do not hold PermissionRequest/);
assert.equal(chromeClient.includes("RESOURCE_VIDEO_CAPTURE"), false);
assert.equal(chromeClient.includes("super.onPermissionRequest"), false);
assert.equal(chromeClient.includes("pendingWebPermissionRequest"), false);

const mic = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatMicrophonePermission.ts")).href
);
const audio = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioCapture.ts")).href
);

assert.equal(mic.TRUSTED_MIC_ORIGIN, "https://sayittome-app.web.app");
assert.equal(
  mic.noticeFromCaptureFailure({
    classified: "denied",
    permissionState: "granted",
  }),
  "failed",
);
assert.equal(
  audio.classifyChatAudioCaptureFailure(
    { name: "NotAllowedError" },
    { nativePlatform: true, granted: true, permissionState: "granted" },
  ),
  "failed",
);

let captureCalls = 0;
const stream = await mic.captureTrustedChatAudioStream({
  native: true,
  permissionState: "granted",
  retryDelayMs: 0,
  getUserMedia: async () => {
    captureCalls += 1;
    if (captureCalls === 1) {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      throw error;
    }
    return { id: "ok" };
  },
});
assert.equal(captureCalls, 2);
assert.equal(stream.id, "ok");

const sdk = path.join(
  process.env.LOCALAPPDATA || "",
  "Android",
  "Sdk",
  "platform-tools",
  "adb.exe",
);
let adb = { available: false, devices: [], recordAudio: null, appops: null, versionCode: null };
if (fs.existsSync(sdk)) {
  const devices = spawnSync(sdk, ["devices"], { encoding: "utf8", timeout: 8000 });
  const lines = String(devices.stdout || "")
    .split(/\r?\n/)
    .filter((line) => /\tdevice$/.test(line));
  adb.available = true;
  adb.devices = lines.map((line) => line.split("\t")[0]);
  if (adb.devices.length) {
    const pkg = spawnSync(
      sdk,
      ["-s", adb.devices[0], "shell", "dumpsys", "package", "com.sayittome.app"],
      { encoding: "utf8", timeout: 12000 },
    );
    const out = String(pkg.stdout || "");
    const version = out.match(/versionCode=(\d+)/);
    const record = out.match(
      /android\.permission\.RECORD_AUDIO: granted=(true|false)/,
    );
    adb.versionCode = version ? Number(version[1]) : null;
    adb.recordAudio = record ? record[1] : null;
    const ops = spawnSync(
      sdk,
      ["-s", adb.devices[0], "shell", "appops", "get", "com.sayittome.app", "RECORD_AUDIO"],
      { encoding: "utf8", timeout: 8000 },
    );
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
  path.join(
    root,
    "android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml",
  ),
  path.join(
    root,
    "android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml",
  ),
];
const mergedPath = mergedCandidates.find((candidate) => fs.existsSync(candidate)) || "";
assert.ok(mergedPath, "merged manifest must exist (run assembleRelease before closing P0)");
const merged = fs.readFileSync(mergedPath, "utf8");
assert.match(merged, /android\.permission\.RECORD_AUDIO/);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_MIC_WEBVIEW_WIRING",
      pass: true,
      versionCode: 122,
      adb,
      mergedManifest: { path: mergedPath, recordAudio: true },
    },
    null,
    2,
  ),
);
