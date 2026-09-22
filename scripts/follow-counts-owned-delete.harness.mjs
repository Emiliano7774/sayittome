/**
 * FOLLOW COUNTS + OWNED CHAT DELETE
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const own = await import(
  pathToFileURL(path.join(root, "src/lib/chat/ownedChatDelete.ts")).href
);
const counts = await import(
  pathToFileURL(path.join(root, "src/lib/profile/followCountReconcile.ts")).href
);

assert.equal(own.exactChatId("a/b"), "");
assert.equal(own.exactChatId("anon_x__anon_to__navbench"), "anon_x__anon_to__navbench");

assert.equal(
  own.callerOwnsInboxChat({
    uid: "owner",
    chatId: "anon_x__anon_to__navbench",
    data: { receptorUid: "owner" },
  }),
  true,
);
assert.equal(
  own.callerOwnsInboxChat({
    uid: "stranger",
    username: "otro",
    chatId: "anon_x__anon_to__navbench",
    data: { receptorUid: "owner" },
  }),
  false,
);
assert.equal(
  own.callerOwnsInboxChat({
    uid: "owner",
    username: "navbench",
    chatId: "anon_x__anon_to__navbench",
    data: {},
  }),
  true,
);

const plan = counts.planFollowCountPatches({
  edges: [
    { followerUid: "a", targetUid: "b" },
    { followerUid: "a", targetUid: "b" },
    { followerUid: "c", targetUid: "b" },
    { followerUid: "a", targetUid: "a" },
  ],
  profiles: new Map([
    ["b", { seguidoresCount: 0, followersCount: 0, siguiendoCount: 0 }],
    ["a", { seguidoresCount: 0, followersCount: 9, siguiendoCount: 0 }],
  ]),
});
const byUid = new Map(plan.map((row) => [row.uid, row]));
assert.equal(byUid.get("b").seguidoresCount, 2);
assert.equal(byUid.get("b").followersCount, 2);
assert.equal(byUid.get("a").siguiendoCount, 1);
assert.equal(byUid.get("a").seguidoresCount, 9);
assert.equal(byUid.get("a").followersCount, 9);

console.log(JSON.stringify({ gate: "FOLLOW_COUNTS_AND_OWNED_DELETE", pass: true }));
