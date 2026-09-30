/**
 * ANON_LOGOUT_NEW_THREAD — logout rotates anon; resolve must not reuse old chatId.
 *   node --experimental-strip-types scripts/anon-logout-new-thread.harness.mjs
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
const resolveSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/resolveProfileChat.ts"),
  "utf8",
);
const sessionSrc = fs.readFileSync(path.join(root, "src/lib/chat/sessionChats.ts"), "utf8");

assert.match(logoutSrc, /rotateAnonSessionPreserving\s*\(/);
assert.doesNotMatch(logoutSrc, /beginFreshAnonSession\s*\(/);
assert.match(sessionSrc, /liveAnonId/);
assert.match(resolveSrc, /findSessionProfileChatIdForUsername\(\s*lookup\.currentUsername,\s*senderId/);

const anon = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonSession.ts")).href
);
const sessionChats = await import(
  pathToFileURL(path.join(root, "src/lib/chat/sessionChats.ts")).href
);

const first = anon.getAnonSessionId();
sessionChats.registerSessionChat(`${first}__anon_to__demo_user`);

// Same session: live anon matches → reuse
assert.equal(
  sessionChats.findSessionProfileChatIdForUsername("demo_user", first),
  `${first}__anon_to__demo_user`,
);

const rotated = anon.rotateAnonSessionPreserving();
assert.notEqual(rotated.next, first);

// After rotation: old session id must NOT be reused
assert.equal(
  sessionChats.findSessionProfileChatIdForUsername("demo_user", rotated.next),
  "",
);

// Building a new chat id uses the new anon
const { buildProfileAnonChatId } = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonChatId.ts")).href
);
const nextId = buildProfileAnonChatId(rotated.next, "demo_user");
assert.notEqual(nextId, `${first}__anon_to__demo_user`);
assert.ok(nextId.startsWith(rotated.next));

const block = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlock.ts")).href
);
const epochSwitch = block.resolveSendChatIdForLiveAnon({
  chatId: `${first}__anon_to__demo_user`,
  username: "demo_user",
  liveAnonId: rotated.next,
});
assert.equal(epochSwitch.chatId, nextId);
assert.equal(epochSwitch.epochSwitched, true);

console.log("PASS anon-logout-new-thread");
