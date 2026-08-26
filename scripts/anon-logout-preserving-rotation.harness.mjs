/**
 * ANON_LOGOUT_PRESERVING_ROTATION — logout rotates once without wiping history.
 *   node --experimental-strip-types scripts/anon-logout-preserving-rotation.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
const sessionSrc = fs.readFileSync(path.join(root, "src/lib/chat/anonSession.ts"), "utf8");
const resolveSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/resolveProfileChat.ts"),
  "utf8",
);

assert.match(logoutSrc, /rotateAnonSessionPreserving\s*\(/);
assert.doesNotMatch(logoutSrc, /beginFreshAnonSession\s*\(/);
assert.doesNotMatch(logoutSrc, /clearSessionChats\s*\(/);
assert.doesNotMatch(logoutSrc, /deleteAnonymousChatsForSession\s*\(/);
assert.doesNotMatch(logoutSrc, /clearThreadAnonContinuity\s*\(/);
assert.doesNotMatch(logoutSrc, /clearCachedChatMessages\s*\(/);
assert.doesNotMatch(logoutSrc, /clearInboxSnapshotCache\s*\(/);

assert.match(sessionSrc, /rotateAnonSessionPreserving/);
assert.match(sessionSrc, /beginFreshAnonSession/);
// Destructive clears belong only to beginFreshAnonSession, not rotate.
const rotateStart = sessionSrc.indexOf("export function rotateAnonSessionPreserving");
const freshStart = sessionSrc.indexOf("export function beginFreshAnonSession");
assert.ok(rotateStart >= 0 && freshStart > rotateStart);
const rotateBody = sessionSrc.slice(rotateStart, freshStart);
assert.doesNotMatch(rotateBody, /clearSessionChats/);
assert.doesNotMatch(rotateBody, /deleteAnonymousChatsForSession/);
assert.doesNotMatch(rotateBody, /clearThreadAnonContinuity/);
assert.doesNotMatch(rotateBody, /clearLocalChatReadForViewer/);

assert.match(resolveSrc, /findSessionProfileChatIdForUsername/);

const anon = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonSession.ts")).href
);
const sessionChats = await import(
  pathToFileURL(path.join(root, "src/lib/chat/sessionChats.ts")).href
);
const identity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonIdentity.ts")).href
);

const first = anon.getAnonSessionId();
sessionChats.registerSessionChat(`${first}__anon_to__demo_user`);
const beforeIds = sessionChats.getSessionChatIds();
assert.ok(beforeIds.includes(`${first}__anon_to__demo_user`));

const rotated = anon.rotateAnonSessionPreserving();
assert.ok(rotated.next.startsWith("anon_"));
assert.notEqual(rotated.next, first);
assert.equal(anon.getAnonSessionId(), rotated.next);
assert.deepEqual(sessionChats.getSessionChatIds(), beforeIds);

const reused = sessionChats.findSessionProfileChatIdForUsername("demo_user");
assert.equal(reused, `${first}__anon_to__demo_user`);

assert.equal(
  identity.shouldShowAnonIdentityGuide({
    isOwnerViewing: false,
    identityChanged: true,
    hasChatActivity: true,
    showModernVisitorIntro: false,
  }),
  true,
);

console.log("PASS anon-logout-preserving-rotation");
