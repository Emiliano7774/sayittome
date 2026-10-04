/**
 * Structural Android FCM wiring checks + optional adb smoke.
 * Usage: node scripts/android-fcm-wiring.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const gs = path.join(root, "android/app/google-services.json");
assert.ok(fs.existsSync(gs), "google-services.json required");
const plugins = JSON.parse(
  fs.readFileSync(path.join(root, "android/app/src/main/assets/capacitor.plugins.json"), "utf8"),
);
assert.ok(
  plugins.some((p) => p.pkg === "@capacitor/push-notifications"),
  "push plugin synced",
);
assert.ok(fs.existsSync(path.join(root, "android/app/src/main/res/raw/whip.mp3")));
assert.ok(
  fs.existsSync(
    path.join(root, "android/app/src/main/java/com/sayittome/app/ChatExpandableMessagingService.java"),
  ),
);
const manifest = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
assert.match(manifest, /ChatExpandableMessagingService/);
assert.match(manifest, /tools:node="remove"/);
assert.match(manifest, /default_notification_icon/);
assert.match(manifest, /@drawable\/ic_stat_notify/);

const fcmService = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/ChatExpandableMessagingService.java"),
  "utf8",
);
assert.match(fcmService, /R\.drawable\.ic_stat_notify/);
assert.match(fcmService, /R\.drawable\.ic_notify_moon/);
assert.match(fcmService, /shouldRenderStoryNotification/);
assert.match(fcmService, /R\.drawable\.ic_stat_story_like/);
assert.doesNotMatch(fcmService, /setSmallIcon\(R\.mipmap\.ic_launcher\)/);
assert.ok(
  fs.existsSync(path.join(root, "android/app/src/main/res/drawable/ic_stat_notify.xml")),
  "white moon status-bar icon",
);
assert.ok(
  fs.existsSync(path.join(root, "android/app/src/main/res/drawable/ic_notify_moon.png")),
  "dark moon large icon",
);
assert.ok(
  fs.existsSync(path.join(root, "android/app/src/main/res/drawable/ic_stat_story_like.xml")),
  "white story-like status-bar icon",
);
assert.ok(
  fs.existsSync(path.join(root, "android/app/src/main/res/drawable/ic_notify_story_like.xml")),
  "pink story-like large icon",
);
const leftoverRobot = fs.readFileSync(
  path.join(root, "android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml"),
  "utf8",
);
assert.doesNotMatch(leftoverRobot, /M66\.94,46\.02/);

const capConfig = JSON.parse(
  fs.readFileSync(path.join(root, "android/app/src/main/assets/capacitor.config.json"), "utf8"),
);
assert.equal(capConfig.appId, "com.sayittome.app");
assert.ok(capConfig.plugins?.PushNotifications);

const sdk = "C:\\Users\\emibe\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
let adb = { available: false, devices: [], bootCompleted: null };
if (fs.existsSync(sdk)) {
  const devices = spawnSync(sdk, ["devices"], { encoding: "utf8" });
  const lines = String(devices.stdout || "")
    .split(/\r?\n/)
    .filter((line) => /\tdevice$/.test(line));
  adb = {
    available: true,
    devices: lines.map((line) => line.split("\t")[0]),
    bootCompleted: null,
  };
  if (adb.devices.length) {
    const boot = spawnSync(sdk, ["shell", "getprop", "sys.boot_completed"], {
      encoding: "utf8",
    });
    adb.bootCompleted = String(boot.stdout || "").trim();
  }
}

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_FCM_WIRING",
      pass: true,
      adb,
      note:
        adb.devices.length === 0
          ? "No adb device — physical/emulator interactive FCM matrix still pending"
          : "Device attached; install debug APK for interactive matrix",
    },
    null,
    2,
  ),
);
