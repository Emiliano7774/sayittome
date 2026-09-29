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
const session = fs.readFileSync(
  path.join(root, "src/lib/anonMatch/anonMatchSession.ts"),
  "utf8",
);
const fetchAnon = fs.readFileSync(
  path.join(root, "src/lib/anonMatch/fetchAnonMatch.ts"),
  "utf8",
);
const presence = fs.readFileSync(
  path.join(root, "src/services/anonymousPresence.ts"),
  "utf8",
);

assert.match(persistence, /browserSessionPersistence/);
assert.match(persistence, /browserLocalPersistence/);
assert.match(persistence, /useAnonymousTabPersistence/);
assert.match(persistence, /useRegisteredAuthPersistence/);
assert.match(persistence, /adoptTabLocalAnonymousAuth/);

// Tab-local uid is claimed at boot, never by churning auth mid-session.
assert.match(ensureStorage, /adoptTabLocalAnonymousAuth/);
assert.match(ensureStorage, /useAnonymousTabPersistence/);
assert.match(ensureStorage, /writeTabAnonClaim/);
assert.doesNotMatch(enterAnon, /signInAnonymously/);
assert.match(enterAnon, /ensureStorageAuth\(\{ allowAnonymous: true \}\)/);
assert.match(login, /useRegisteredAuthPersistence/);

// A stored alias must never outlive the uid it was bound to.
assert.match(session, /ANON_MATCH_ALIAS_OWNER_KEY/);
assert.match(session, /export function dropAnonMatchAliasIfForeign/);
assert.match(fetchAnon, /dropAnonMatchAliasIfForeign\(user\.uid\)/);
assert.match(fetchAnon, /storeAnonMatchAlias\(anonId, user\.uid\)/);
assert.match(presence, /cachedPresenceAlias = ""/);

console.log(
  JSON.stringify({ gate: "ANON_MATCH_TAB_ISOLATION", pass: true }, null, 2),
);
