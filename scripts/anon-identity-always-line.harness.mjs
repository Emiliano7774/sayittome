/**
 * ANON_IDENTITY_ALWAYS_LINE — top own-anon line after conversation starts.
 *   node scripts/anon-identity-always-line.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
const identity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonIdentity.ts")).href
);

assert.match(chatSrc, /showVisitorIdentityLine/);
assert.match(chatSrc, /showModernIdentityBar/);
assert.match(chatSrc, /chat_anon_you_are/);
assert.match(chatSrc, /Identity-change divider stays mid-thread/);
assert.doesNotMatch(
  chatSrc,
  /!\(showAnonIdentityNotice && hasChatActivity\)/,
);

assert.match(logoutSrc, /rotateAnonSessionPreserving\s*\(/);
assert.doesNotMatch(logoutSrc, /beginFreshAnonSession\s*\(/);
assert.doesNotMatch(logoutSrc, /clearThreadAnonContinuity\s*\(/);
assert.doesNotMatch(logoutSrc, /clearSessionChats\s*\(/);
assert.doesNotMatch(logoutSrc, /deleteAnonymousChatsForSession\s*\(/);

assert.equal(
  identity.shouldShowAnonIdentityGuide({
    isOwnerViewing: false,
    identityChanged: true,
    hasChatActivity: true,
    showModernVisitorIntro: false,
  }),
  true,
);
assert.equal(
  identity.shouldShowAnonIdentityGuide({
    isOwnerViewing: true,
    identityChanged: true,
    hasChatActivity: true,
    showModernVisitorIntro: false,
  }),
  false,
);

assert.equal(
  identity.shouldShowAnonIdentityDivider("anon_new", "anon_old"),
  true,
);

console.log("PASS anon-identity-always-line");
