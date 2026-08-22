/**
 * Real firebase-admin cold start: named-only app must not skip default init.
 * Usage: node scripts/functions-admin-app-cold-start.harness.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = path.join(root, "functions");
const require = createRequire(path.join(functionsRoot, "package.json"));

const pkg = JSON.parse(fs.readFileSync(path.join(functionsRoot, "package.json"), "utf8"));
assert.equal(pkg.dependencies["sayittome-web"], undefined);
assert.equal(fs.existsSync(path.join(functionsRoot, "node_modules/sayittome-web")), false);

const adminAppSrc = fs.readFileSync(path.join(functionsRoot, "src/adminApp.ts"), "utf8");
const indexSrc = fs.readFileSync(path.join(functionsRoot, "src/index.ts"), "utf8");
const deleteSrc = fs.readFileSync(path.join(functionsRoot, "src/deleteChatMessage.ts"), "utf8");

assert.match(adminAppSrc, /deps\.getApp\(\)/);
assert.match(adminAppSrc, /deps\.initializeApp\(\)/);
assert.match(adminAppSrc, /getFirestore\(ensureAdminApp\(\)\)/);
assert.match(adminAppSrc, /getStorage\(ensureAdminApp\(\)\)/);
assert.doesNotMatch(adminAppSrc, /if\s*\(\s*!getApps\(\)\.length/);
assert.doesNotMatch(indexSrc, /getFirestore\(\s*\)/);
assert.doesNotMatch(indexSrc, /if\s*\(\s*!getApps\(\)\.length/);
assert.doesNotMatch(deleteSrc, /getStorage\(\s*\)/);
assert.match(deleteSrc, /storage\(\)\.bucket\(\)/);

const { getApp, getApps, initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const compiled = require(path.join(functionsRoot, "lib/adminApp.js"));

async function deleteAllApps() {
  await Promise.all(getApps().map((app) => deleteApp(app).catch(() => {})));
}

function oldEnsureApp() {
  if (!getApps().length) initializeApp({ projectId: "sayittome-app" });
}

await deleteAllApps();

initializeApp({ projectId: "sayittome-app" }, "named-only");
assert.equal(getApps().length, 1);
assert.equal(getApps()[0].name, "named-only");

oldEnsureApp();
assert.equal(getApps().some((app) => app.name === "[DEFAULT]"), false);
try {
  getFirestore();
  assert.fail("expected default-app-missing when only a named app exists");
} catch (error) {
  assert.match(String(error?.errorInfo?.code || error?.code || error), /app\/no-app|default/i);
  assert.match(String(error.message || error), /default Firebase app does not exist|no-app/i);
}

const resolved = compiled.resolveAdminApp({
  getApp,
  initializeApp: () => initializeApp({ projectId: "sayittome-app" }),
});
assert.equal(resolved.name, "[DEFAULT]");
const firestore = getFirestore(resolved);
assert.equal(typeof firestore.collection, "function");

await deleteAllApps();
const coldApp = compiled.ensureAdminApp();
assert.equal(coldApp.name, "[DEFAULT]");
const coldDb = compiled.db();
assert.equal(typeof coldDb.collection, "function");
assert.equal(typeof coldDb.collection("chats_anonimos").doc, "function");

await deleteAllApps();

const child = spawnSync(
  process.execPath,
  [
    "-e",
    `
      const path = require('path');
      const { createRequire } = require('module');
      const requireFn = createRequire(path.join(${JSON.stringify(functionsRoot)}, 'package.json'));
      const { getApp, getApps } = requireFn('firebase-admin/app');
      const admin = requireFn(${JSON.stringify(path.join(functionsRoot, "lib/adminApp.js"))});
      if (getApps().length !== 0) {
        throw new Error('child process was not a cold start: ' + getApps().map((app) => app.name).join(','));
      }
      const app = admin.ensureAdminApp();
      const db = admin.db();
      getApp();
      if (app.name !== '[DEFAULT]') throw new Error('expected default app, got ' + app.name);
      if (typeof db.collection !== 'function') throw new Error('db() missing collection');
      db.collection('chats_anonimos').doc('pad_a_b');
      console.log(JSON.stringify({ cold: true, app: app.name, apps: getApps().map((row) => row.name) }));
    `,
  ],
  { cwd: functionsRoot, encoding: "utf8" },
);

assert.equal(child.status, 0, child.stderr || child.stdout);
const cold = JSON.parse(String(child.stdout || "").trim().split("\n").pop());
assert.equal(cold.cold, true);
assert.equal(cold.app, "[DEFAULT]");
assert.deepEqual(cold.apps, ["[DEFAULT]"]);

await deleteAllApps();

console.log(
  JSON.stringify(
    {
      gate: "FUNCTIONS_ADMIN_APP_COLD_START",
      pass: true,
      namedOnlyRepro: "default-app-missing",
      childColdStart: cold,
    },
    null,
    2,
  ),
);
