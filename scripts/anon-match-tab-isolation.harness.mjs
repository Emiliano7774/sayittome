/**
 * Same-browser anonymous tabs must not share one Firebase Auth uid.
 * Usage: node scripts/anon-match-tab-isolation.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const persistence = fs.readFileSync(
  path.join(root, "src/lib/auth/authPersistence.ts"),
  "utf8",
);
const enterAnon = fs.readFileSync(
  path.join(root, "src/lib/auth/enterAnonymousMode.ts"),
  "utf8",
);
const ensureStorage = fs.readFileSync(
  path.join(root, "src/lib/auth/ensureStorageAuth.ts"),
  "utf8",
);
const login = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");

assert.match(persistence, /browserSessionPersistence/);
assert.match(persistence, /browserLocalPersistence/);
assert.match(persistence, /useAnonymousTabPersistence/);
assert.match(persistence, /useRegisteredAuthPersistence/);

assert.match(enterAnon, /useAnonymousTabPersistence/);
assert.match(enterAnon, /signInAnonymously/);
assert.match(enterAnon, /signOut\(auth\)/);
assert.match(
  enterAnon,
  /Complete registered profile keeps durable Auth|registered profile/,
);

assert.match(ensureStorage, /useAnonymousTabPersistence/);
assert.match(login, /useRegisteredAuthPersistence/);

console.log(
  JSON.stringify({ gate: "ANON_MATCH_TAB_ISOLATION", pass: true }, null, 2),
);
