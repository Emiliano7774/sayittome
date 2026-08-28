/**
 * P0_ADMIN_DEFAULT_APP — DEFAULT vs named-only firebase-frameworks registry.
 * Simulates SDK11.11.1: named-only getFirestore() fails; explicit DEFAULT fixes it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const defaultAppSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/firebaseAdminDefaultApp.ts"),
  "utf8",
);
const strictSrc = fs.readFileSync(path.join(root, "src/lib/admin/verifyAdminP0DiagStrict.ts"), "utf8");

assert.match(defaultAppSrc, /DEFAULT_ADMIN_APP_NAME = "\[DEFAULT\]"/);
assert.match(defaultAppSrc, /app\.name !== DEFAULT_ADMIN_APP_NAME/);
assert.match(defaultAppSrc, /resolveDefaultAdminApp/);
assert.doesNotMatch(defaultAppSrc, /getApps\(\)\.length === 0/);
assert.doesNotMatch(defaultAppSrc, /if\s*\(\s*!getApps\(\)\.length/);
assert.match(strictSrc, /getAuth\(app\)/);
assert.match(strictSrc, /ensureDefaultAdminApp/);

const mod = await import(
  pathToFileURL(path.join(root, "src/lib/admin/firebaseAdminDefaultApp.ts")).href
);

const require = createRequire(path.join(root, "package.json"));
const { getApp, getApps, initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

async function deleteAllApps() {
  await Promise.all(getApps().map((app) => deleteApp(app).catch(() => {})));
}

function depsFromSdk() {
  return mod.buildDefaultAdminAppDeps();
}

await deleteAllApps();
const cold = mod.resolveDefaultAdminApp(depsFromSdk());
assert.equal(cold.name, mod.DEFAULT_ADMIN_APP_NAME);
assert.equal(typeof getFirestore(cold).collection, "function");

await deleteAllApps();
initializeApp({ projectId: mod.EXPECTED_ADMIN_PROJECT_ID }, "firebase-frameworks");
assert.equal(getApps().length, 1);
assert.equal(getApps()[0].name, "firebase-frameworks");
let namedOnlyFailed = false;
try {
  getFirestore();
} catch (error) {
  namedOnlyFailed = true;
  assert.match(String(error?.code || error?.message || error), /no-app|default/i);
}
assert.equal(namedOnlyFailed, true);
const fixed = mod.resolveDefaultAdminApp(depsFromSdk());
assert.equal(fixed.name, mod.DEFAULT_ADMIN_APP_NAME);
assert.equal(typeof getFirestore(fixed).collection, "function");
assert.equal(mod.hasDefaultAdminApp(getApps()), true);
assert.equal(mod.countNamedAdminApps(getApps()), 1);

await deleteAllApps();
initializeApp({ projectId: mod.EXPECTED_ADMIN_PROJECT_ID }, mod.DEFAULT_ADMIN_APP_NAME);
const reused = mod.resolveDefaultAdminApp(depsFromSdk());
assert.equal(reused.name, mod.DEFAULT_ADMIN_APP_NAME);

await deleteAllApps();
initializeApp({ projectId: "other-project-id" }, mod.DEFAULT_ADMIN_APP_NAME);
let wrongProject = false;
try {
  mod.resolveDefaultAdminApp(depsFromSdk());
} catch (error) {
  wrongProject = true;
  assert.equal(error.causeCode, "project/mismatch");
}
assert.equal(wrongProject, true);

await deleteAllApps();

const strictHarness = spawnSync("node", ["scripts/p0-admin-p0-diag-strict-auth.harness.mjs"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(strictHarness.status, 0, strictHarness.stderr || strictHarness.stdout);

console.log(
  JSON.stringify({
    gate: "P0_ADMIN_DEFAULT_APP",
    pass: true,
    scenarios: {
      empty: "default_created",
      namedOnlyFramework: "default_created_getFirestore_ok",
      existingDefault: "reused",
      wrongProjectDefault: "project_mismatch_503",
    },
    sdkNote: "named-only getFirestore fails; explicit DEFAULT fixes",
    activateGates: false,
  }),
);
