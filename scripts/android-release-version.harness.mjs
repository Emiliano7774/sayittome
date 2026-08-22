/**
 * Monotonic Android versionCode: max(apk, gradle, app-version)+1, fail-closed.
 * Usage: node scripts/android-release-version.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = await import(
  pathToFileURL(path.join(root, "scripts/androidReleaseVersion.mjs")).href
);

const staleNext = version.computeNextReleaseVersion([
  { name: "apkRelease", versionCode: 112, versionName: "1.0.3" },
  { name: "gradle", versionCode: 115, versionName: "1.0.6" },
  { name: "appVersion", versionCode: 114, versionName: "1.0.5" },
]);
assert.equal(staleNext.versionCode, 116);
assert.equal(staleNext.maxCode, 115);

const sources115 = [
  { name: "apkRelease", versionCode: 112, versionName: "1.0.3" },
  { name: "gradle", versionCode: 115, versionName: "1.0.6" },
  { name: "appVersion", versionCode: 114, versionName: "1.0.5" },
];
assert.equal(version.assertNotDowngrade(sources115, 116), 116);
assert.throws(
  () => version.assertNotDowngrade(sources115, 114),
  (error) => error.code === "version_code_downgrade",
);
assert.throws(
  () => version.assertNotDowngrade(sources115, 113),
  (error) => error.code === "version_code_downgrade",
);

const invalidCodes = [112.5, "115", "abc", -1, 0, 2_100_000_001, NaN, null, undefined, true, {}, []];
for (const value of invalidCodes) {
  assert.throws(
    () => version.validateVersionCode(value, "harness"),
    (error) =>
      error.code === "invalid_version_code" || error.code === "version_code_out_of_range",
  );
}

assert.equal(version.validateVersionCode(116, "harness"), 116);
assert.throws(
  () => version.validateVersionName("1.0", "harness"),
  (error) => error.code === "invalid_version_name",
);
assert.throws(
  () =>
    version.parseGradleDefaultConfig(
      'defaultConfig { versionCode 115.5 versionName "1.0.6" }',
      "gradle",
    ),
  (error) => error.code === "invalid_gradle_version" || error.code === "invalid_version_code",
);
assert.throws(
  () => version.parseJsonReleaseVersion({ versionCode: "114", versionName: "1.0.5" }, "appVersion"),
  (error) => error.code === "invalid_version_code",
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_RELEASE_VERSION",
      pass: true,
      staleNext: staleNext.versionCode,
    },
    null,
    2,
  ),
);
