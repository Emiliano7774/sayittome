/**
 * ANDROID_AD_ID_PERMISSION
 * Play Advertising ID declaration requires AD_ID in the (merged) manifest.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "android/app/src/main/AndroidManifest.xml");
const gradlePath = path.join(root, "android/app/build.gradle");
const apkReleasePath = path.join(root, "apk.release.json");

const manifest = fs.readFileSync(manifestPath, "utf8");
assert.match(
  manifest,
  /android:name="com\.google\.android\.gms\.permission\.AD_ID"/,
);
assert.match(manifest, /tools:node="merge"/);

const gradle = fs.readFileSync(gradlePath, "utf8");
assert.match(gradle, /^\s*versionCode\s+123\s*$/m);
assert.match(gradle, /^\s*versionName\s+"1\.0\.10"\s*$/m);

const apkRelease = JSON.parse(fs.readFileSync(apkReleasePath, "utf8"));
assert.equal(apkRelease.versionCode, 123);
assert.equal(apkRelease.versionName, "1.0.10");

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
      versionCode: 123,
      versionName: "1.0.10",
      mergedPath: path.relative(root, mergedPath).replaceAll("\\", "/"),
    },
    null,
    2,
  ),
);
