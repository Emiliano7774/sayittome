/**
 * ANDROID_AD_ID_PERMISSION
 * Play Advertising ID declaration requires AD_ID in the (merged) manifest.
 * Version is derived from canonical release sources (not a pinned ephemeral code).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readReleaseSources } from "./androidReleaseVersion.mjs";

/** Floor: AD_ID permission first shipped at versionCode 123. */
const MIN_AD_ID_VERSION_CODE = 123;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "android/app/src/main/AndroidManifest.xml");
const gradlePath = path.join(root, "android/app/build.gradle");

const { gradle: gradleVersion, apkRelease, appVersion } = readReleaseSources(root);
assert.equal(gradleVersion.versionCode, apkRelease.versionCode, "gradle vs apk.release.json");
assert.equal(gradleVersion.versionCode, appVersion.versionCode, "gradle vs app-version.json");
assert.equal(gradleVersion.versionName, apkRelease.versionName, "gradle vs apk.release.json name");
assert.equal(gradleVersion.versionName, appVersion.versionName, "gradle vs app-version.json name");
assert.ok(
  gradleVersion.versionCode >= MIN_AD_ID_VERSION_CODE,
  `versionCode ${gradleVersion.versionCode} below AD_ID floor ${MIN_AD_ID_VERSION_CODE}`,
);

const manifest = fs.readFileSync(manifestPath, "utf8");
assert.match(
  manifest,
  /android:name="com\.google\.android\.gms\.permission\.AD_ID"/,
);
assert.match(manifest, /tools:node="merge"/);

const gradle = fs.readFileSync(gradlePath, "utf8");
assert.match(gradle, /^\s*versionCode\s+\d+\s*$/m);
assert.match(gradle, /^\s*versionName\s+"\d+\.\d+\.\d+"\s*$/m);

const mergedCandidates = [
  path.join(
    root,
    "android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml",
  ),
  path.join(
    root,
    "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml",
  ),
  path.join(
    root,
    "android/app/build/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml",
  ),
];

const mergedPath = mergedCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(mergedPath, "release merged manifest missing — run processReleaseMainManifest / bundleRelease first");
const merged = fs.readFileSync(mergedPath, "utf8");
assert.match(
  merged,
  /android:name="com\.google\.android\.gms\.permission\.AD_ID"/,
  `AD_ID missing from merged manifest: ${mergedPath}`,
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_AD_ID_PERMISSION",
      pass: true,
      versionCode: gradleVersion.versionCode,
      versionName: gradleVersion.versionName,
      minVersionCode: MIN_AD_ID_VERSION_CODE,
      mergedPath: path.relative(root, mergedPath).replaceAll("\\", "/"),
    },
    null,
    2,
  ),
);
