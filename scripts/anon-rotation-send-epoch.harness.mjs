/**
 * ANON_ROTATION_SEND_EPOCH — a rotated anon identity must not write into the
 * previous visitor's thread. Reproduces the 2026-09-30 incident where the open
 * screen's cached chat doc redirected the send back to the old chatId, so the
 * receptor saw both messages stacked under the same anonymous conversation.
 *   node --experimental-strip-types scripts/anon-rotation-send-epoch.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const persist = await import(
  pathToFileURL(path.join(root, "src/lib/chat/persistAnonMessage.ts")).href
);
const abuse = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlock.ts")).href
);

// Identities and documents taken from the reproduced production incident.
const oldAnon = "anon_gakurzpwg9_muno633r";
const newAnon = "anon_cjkdi1w6fu_muno6lmx";
const oldChatId = `${oldAnon}__anon_to__sex`;
const newChatId = `${newAnon}__anon_to__sex`;
const ownerUid = "766TxAUdYbd4L3oyrIhUOlI2RyS2";

// What the open chat screen still holds after logout rotated the identity.
const openThreadDoc = {
  canonicalChatId: oldChatId,
  anonSessionId: oldAnon,
  targetUid: ownerUid,
  receptorUsername: "SEX",
  participantes: [oldAnon, ownerUid],
};

// The regression: stale data from the previous epoch must never seed the send.
assert.equal(persist.chatDataMatchesThread(newChatId, openThreadDoc), false);
// Same thread keeps using its cached doc — no extra read on the common path.
assert.equal(persist.chatDataMatchesThread(oldChatId, openThreadDoc), true);
// Empty/absent data is never usable.
assert.equal(persist.chatDataMatchesThread(newChatId, {}), false);
assert.equal(persist.chatDataMatchesThread(newChatId, null), false);
// A doc carrying only the stale anon session is still cross-epoch.
assert.equal(
  persist.chatDataMatchesThread(newChatId, { anonSessionId: oldAnon }),
  false,
);
assert.equal(
  persist.chatDataMatchesThread(newChatId, { anonSessionId: newAnon }),
  true,
);
// Legacy alias bridges have no epoch of their own and must keep working.
assert.equal(
  persist.chatDataMatchesThread("legacy_owner_chat", { canonicalChatId: newChatId }),
  true,
);

assert.equal(abuse.sameAnonChatEpoch(oldChatId, newChatId), false);
assert.equal(abuse.sameAnonChatEpoch(oldChatId, oldChatId), true);
assert.equal(abuse.sameAnonChatEpoch("legacy_owner_chat", newChatId), true);

// The send path resolves the new epoch from the live anon.
const resolved = abuse.resolveSendChatIdForLiveAnon({
  chatId: oldChatId,
  username: "sex",
  liveAnonId: newAnon,
});
assert.equal(resolved.chatId, newChatId);
assert.equal(resolved.epochSwitched, true);

// Cross-epoch aliases must never be migrated into the new thread either.
assert.deepEqual(abuse.filterSameEpochLegacyIds(newChatId, [oldChatId]), []);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
// Cached data is gated, and the alias bridge cannot cross an epoch boundary.
assert.match(persistSrc, /chatDataMatchesThread\(chatId,\s*input\.existingChatData\)/);
assert.match(persistSrc, /sameAnonChatEpoch\(storedCanonicalChatId,\s*chatId\)/);

console.log(JSON.stringify({ gate: "ANON_ROTATION_SEND_EPOCH", pass: true }, null, 2));
