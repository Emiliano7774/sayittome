/**
 * ANON_IDENTITY_STABLE_SESSION
 * Guards against implicit anonymous identity changes while a session is alive.
 * Run: node scripts/anon-identity-stable-session.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (p) => fs.readFileSync(path.join(root, p), "utf8");
const entry = source("src/lib/auth/enterAnonymousMode.ts");
const auth = source("src/lib/auth/authPersistence.ts");
const ensure = source("src/lib/auth/ensureStorageAuth.ts");
const bind = source("src/lib/abuse/bindProfileAnonVisitorSession.ts");
const logout = source("src/lib/auth/logout.ts");
const alias = source("src/lib/anonMatch/fetchAnonMatch.ts");
const lifecycle = source("src/components/AnonSessionLifecycle.tsx");

// Returning to Shuffle must refresh presence, never ask for a new identity.
assert.match(entry, /await resolveAnonMatchSessionId\(\)/);
assert.doesNotMatch(entry, /resolveAnonMatchSessionId\(\{ rotate:\s*true \}\)/);
assert.match(entry, /bumpAnonymousPresenceForMatch/);
assert.doesNotMatch(lifecycle, /rotateAnonSessionPreserving|beginFreshAnonSession/);

// Missing claim or WebView renderer restoration must keep the existing uid.
assert.match(auth, /hasTabLocalFirebaseAuthUid\(current\.uid\)/);
assert.match(auth, /isNativeAppShell\(\)/);
assert.match(auth, /writeTabAnonClaim\(current\.uid\)/);
assert.match(auth, /anonymousAdoptionPromise/);
assert.match(ensure, /await waitForAnonymousAdoption\(\)/);
// Shared cross-tab Firebase auth still needs isolation on genuine first claim.
assert.match(auth, /await useAnonymousTabPersistence\(\)/);
assert.match(auth, /await signOut\(auth\)/);
assert.match(auth, /await signInAnonymously\(auth\)/);

// Lease conflict must not rotate all other chats or this visitor's alias.
assert.doesNotMatch(bind, /rotateAnonSessionPreserving\(/);
assert.doesNotMatch(bind, /buildProfileAnonChatId\(/);
assert.match(bind, /err\.requireNewEpoch = Boolean\(json\?\.requireNewEpoch\)/);

// Explicit logout is still permitted to generate the next anonymous identity.
assert.match(logout, /rotateAnonSessionPreserving\(\)/);
assert.match(alias, /dropAnonMatchAliasIfForeign\(user\.uid\)/);
console.log("PASS ANON_IDENTITY_STABLE_SESSION: reentry, auth, lease, logout, cross-tab");
