/**
 * VIEW_ONCE_CLAIM
 * Authoritative bomb views: legacy=1, N limits, double-tap coalesce, dual claim race.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(
  pathToFileURL(path.join(root, "functions/src/viewOnceClaimCore.ts")).href
);

assert.equal(core.normalizeViewOnceLimit(undefined), 1);
assert.equal(core.normalizeViewOnceLimit(null), 1);
assert.equal(core.normalizeViewOnceLimit(0), 1);
assert.equal(core.normalizeViewOnceLimit(3), 3);
assert.equal(core.normalizeViewOnceLimit(99), 5);

const baseMsg = {
  viewOnce: true,
  viewOnceLimit: 1,
  viewOnceOpenedCount: 0,
  fromUid: "profile_owner",
  senderAuthUid: "owner",
  mediaUrl: "",
};

const first = core.decideViewOnceClaim({
  uid: "visitor",
  isMember: true,
  message: baseMsg,
  secretMediaUrl: "https://cdn.example/bomb.jpg",
});
assert.equal(first.ok, true);
assert.equal(first.openedCount, 1);
assert.equal(first.remaining, 0);
assert.equal(first.exhausted, true);
assert.equal(first.mediaUrl, "https://cdn.example/bomb.jpg");

const second = core.decideViewOnceClaim({
  uid: "visitor",
  isMember: true,
  message: { ...baseMsg, viewOnceOpenedCount: 1 },
  secretMediaUrl: "https://cdn.example/bomb.jpg",
});
assert.equal(second.ok, false);
assert.equal(second.reason, "exhausted");

const legacy = core.decideViewOnceClaim({
  uid: "visitor",
  isMember: true,
  message: { viewOnce: true, fromUid: "anon_x", mediaUrl: "" },
  secretMediaUrl: "https://cdn.example/legacy.jpg",
});
assert.equal(legacy.ok, true);
assert.equal(legacy.limit, 1);
assert.equal(legacy.exhausted, true);

const multi = core.decideViewOnceClaim({
  uid: "visitor",
  isMember: true,
  message: {
    viewOnce: true,
    viewOnceLimit: 3,
    viewOnceOpenedCount: 1,
    fromUid: "profile_owner",
  },
  secretMediaUrl: "https://cdn.example/n.jpg",
});
assert.equal(multi.ok, true);
assert.equal(multi.openedCount, 2);
assert.equal(multi.remaining, 1);
assert.equal(multi.exhausted, false);

const authorBlocked = core.decideViewOnceClaim({
  uid: "owner",
  isMember: true,
  message: baseMsg,
  secretMediaUrl: "https://cdn.example/bomb.jpg",
});
assert.equal(authorBlocked.ok, false);
assert.equal(authorBlocked.reason, "author");

// Simulate two devices racing for the last view: only the pre-increment state of 2/3 may claim.
const raceA = core.decideViewOnceClaim({
  uid: "device-a",
  isMember: true,
  message: {
    viewOnce: true,
    viewOnceLimit: 2,
    viewOnceOpenedCount: 1,
    fromUid: "profile_owner",
  },
  secretMediaUrl: "https://cdn.example/race.jpg",
});
const raceB = core.decideViewOnceClaim({
  uid: "device-b",
  isMember: true,
  message: {
    viewOnce: true,
    viewOnceLimit: 2,
    viewOnceOpenedCount: 2,
    fromUid: "profile_owner",
  },
  secretMediaUrl: "https://cdn.example/race.jpg",
});
assert.equal(raceA.ok, true);
assert.equal(raceA.exhausted, true);
assert.equal(raceB.ok, false);
assert.equal(raceB.reason, "exhausted");

const fnSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnSrc, /claimViewOnceMedia/);
assert.match(fnSrc, /commitViewOnceSecret/);
assert.match(fnSrc, /sealViewOnceMediaIfNeeded/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /openBombMessage/);
assert.match(chatSrc, /viewOnceLimit/);
assert.match(chatSrc, /claimViewOnceMedia/);
assert.doesNotMatch(chatSrc, /canOpenViewOnce|markOpened/);

const policy = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOncePolicy.ts")).href
);
assert.equal(policy.viewOnceRemaining({ viewOnce: true }), 1);
assert.equal(
  policy.viewOnceRemaining({
    viewOnce: true,
    viewOnceLimit: 5,
    viewOnceOpenedCount: 2,
  }),
  3,
);
assert.equal(
  policy.redactViewOnceMediaUrl({
    viewOnce: true,
    mine: false,
    mediaUrl: "https://leak",
  }).mediaUrl,
  undefined,
);
assert.equal(
  policy.assertNoClientReadableViewOnceMedia({
    viewOnce: true,
    mediaUrl: "",
  }),
  true,
);

const lock = await import(pathToFileURL(path.join(root, "src/lib/media/viewOnce.ts")).href);
assert.equal(lock.beginViewOnceClaim("m1"), true);
assert.equal(lock.beginViewOnceClaim("m1"), false); // double tap
lock.endViewOnceClaim("m1");
assert.equal(lock.beginViewOnceClaim("m1"), true);
lock.endViewOnceClaim("m1");

console.log(JSON.stringify({ gate: "VIEW_ONCE_CLAIM", pass: true }, null, 2));
