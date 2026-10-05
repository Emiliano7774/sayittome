/**
 * Shuffle recency mix + live anonymous sessions.
 * Usage: node --experimental-strip-types scripts/shuffle-live-visitors.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  mixShuffleWindow,
  planLiveVisitorSlots,
  SHUFFLE_FRESH_MS,
  SHUFFLE_WEEK_MS,
} = await import(pathToFileURL(path.join(root, "src/lib/shuffle/shuffleRecencyMix.ts")).href);

const { sanitizeShuffleVisitorChatId, forceShuffleVisitorOnline } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleVisitorId.ts")).href
);

const NOW = Date.parse("2026-10-05T14:00:00.000Z");

function profile(uid, ageMs, extra = {}) {
  return {
    uid,
    authUid: uid,
    username: extra.username || uid,
    lastActive: new Date(NOW - ageMs).toISOString(),
    presenceAt: new Date(NOW - ageMs).toISOString(),
    shuffleVisitor: extra.shuffleVisitor === true,
    ...extra,
  };
}

function count(rows, pred) {
  return rows.filter(pred).length;
}

const ancient = Array.from({ length: 200 }, (_, i) => profile(`old-${i}`, 100 * 24 * 60 * 60 * 1000));
const fresh = Array.from({ length: 17 }, (_, i) => profile(`fresh-${i}`, 60 * 60 * 1000));
const week = Array.from({ length: 12 }, (_, i) => profile(`week-${i}`, 3 * SHUFFLE_WEEK_MS / 7));
const visitors = Array.from({ length: 189 }, (_, i) =>
  profile(`anon_visitor_${i}_abcd`, 30_000, {
    username: "Anónimo",
    shuffleVisitor: true,
  }),
);

const mixed = mixShuffleWindow([...ancient, ...fresh, ...week, ...visitors], {
  now: NOW,
  windowSize: 35,
  random: () => 0.1,
});

assert.equal(mixed.length, 35, "window stays full");
const visitorCount = count(mixed, (row) => row.shuffleVisitor);
const freshCount = count(mixed, (row) => String(row.uid).startsWith("fresh-"));
const ancientCount = count(mixed, (row) => String(row.uid).startsWith("old-"));
assert.ok(visitorCount > 0, "live anons are in the window");
assert.ok(visitorCount <= 20, `visitors do not erase profiles (${visitorCount})`);
assert.ok(freshCount > 0, "someone active today is included");
assert.ok(ancientCount > 0 && ancientCount < 20, `older profiles are a minority (${ancientCount})`);
assert.ok(visitorCount + freshCount < 35, "the window is not only people who just arrived");

const onlyAncient = mixShuffleWindow(ancient, { now: NOW, windowSize: 10, random: () => 0.3 });
assert.equal(onlyAncient.length, 10, "shuffle does not go empty when only older profiles exist");

const onlyVisitors = mixShuffleWindow(visitors.slice(0, 8), {
  now: NOW,
  windowSize: 10,
  random: () => 0.4,
});
assert.equal(onlyVisitors.length, 8);
assert.ok(onlyVisitors.every((row) => row.shuffleVisitor));

const oneFresh = mixShuffleWindow(
  [...ancient, profile("fresh-today", 5 * 60 * 1000)],
  { now: NOW, windowSize: 10, random: () => 0.2 },
);
assert.ok(oneFresh.some((row) => row.uid === "fresh-today"), "a profile active today is not buried");

const dedupeSource = fs.readFileSync(
  path.join(root, "src/lib/shuffle/dedupeProfiles.ts"),
  "utf8",
);
assert.match(
  dedupeSource,
  /if \(anonIds\.length > 0\) \{\s*return anonIds\.map\(\(id\) => `id:\$\{id\}`\);/,
  "anonymous sessions stay distinct in shuffle dedupe",
);

const visible = [
  profile("anon_gone_1", 1000, { shuffleVisitor: true, username: "Anónimo" }),
  profile("keep-me", 2 * SHUFFLE_FRESH_MS),
  profile("anon_stay_2", 1000, { shuffleVisitor: true, username: "Anónimo" }),
];
const planned = planLiveVisitorSlots(
  visible,
  [
    profile("anon_stay_2", 1000, { shuffleVisitor: true, username: "Anónimo" }),
    profile("anon_new_3", 1000, { shuffleVisitor: true, username: "Anónimo" }),
  ],
  35,
  NOW,
);
assert.deepEqual(
  planned.map((row) => row.uid),
  ["keep-me", "anon_stay_2", "anon_new_3"],
);

const injected = planLiveVisitorSlots(
  [profile("stale", 90 * 24 * 60 * 60 * 1000), profile("also-stale", 80 * 24 * 60 * 60 * 1000)],
  [profile("anon_live_1", 1000, { shuffleVisitor: true, username: "Anónimo" })],
  10,
  NOW,
);
assert.ok(injected.some((row) => row.uid === "anon_live_1"));
assert.equal(injected.length, 2);

const forced = forceShuffleVisitorOnline({
  shuffleVisitor: true,
  showOnline: false,
  mostrarUltimaVez: false,
  online: false,
});
assert.equal(forced.showOnline, true);
assert.equal(forced.mostrarUltimaVez, true);
assert.equal(forced.online, true);
const untouched = forceShuffleVisitorOnline({ showOnline: false, username: "ada" });
assert.equal(untouched.showOnline, false);

assert.equal(sanitizeShuffleVisitorChatId("anon_abc123_def"), "anon_abc123_def");
assert.equal(sanitizeShuffleVisitorChatId("anon_server"), "");
assert.equal(sanitizeShuffleVisitorChatId("firebaseUid"), "");
assert.ok(SHUFFLE_FRESH_MS < SHUFFLE_WEEK_MS);

console.log("shuffle-live-visitors: PASS");
