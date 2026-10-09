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

const { sanitizeShuffleVisitorChatId, forceShuffleVisitorOnline, collapseRowsByOwner } = await import(
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

// In a normal-size pool all live anons must be shown, randomly interleaved.
let seed = 123456789;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const tenLive = visitors.slice(0, 10);
const mixedEveryAnon = mixShuffleWindow([...ancient, ...tenLive], {
  now: NOW, windowSize: 35, random: rng,
});
assert.equal(mixedEveryAnon.length, 35);
assert.equal(count(mixedEveryAnon, (row) => row.shuffleVisitor), 10, "all live visitors fit");
const anonPositions = mixedEveryAnon.map((row, i) => row.shuffleVisitor ? i : -1).filter((i) => i >= 0);
assert.ok(anonPositions.some((i) => i > 0 && i < 34), "visitors are spread among registered cards");
assert.ok(anonPositions[0] > 0 || anonPositions.at(-1) < 34, "not an anonymous-only prefix");

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
  planned.map((row) => row.uid).sort(),
  ["keep-me", "anon_stay_2", "anon_new_3"].sort(),
  "visitor insertion is randomized, membership is exact",
);

const injected = planLiveVisitorSlots(
  [profile("stale", 90 * 24 * 60 * 60 * 1000), profile("also-stale", 80 * 24 * 60 * 60 * 1000)],
  [profile("anon_live_1", 1000, { shuffleVisitor: true, username: "Anónimo" })],
  10,
  NOW,
);
assert.ok(injected.some((row) => row.uid === "anon_live_1"));
assert.equal(injected.length, 3, "free seats keep both registered profiles while adding the anon");

// Regression: a full painted window with one existing anon must admit other
// actual live visitors without a manual reshuffle or waiting for a departure.
const packedWindow = [
  profile("anon_packed_stay", 1000, { shuffleVisitor: true }),
  ...Array.from({ length: 34 }, (_, i) => profile(`packed-registered-${i}`, 90 * 24 * 60 * 60 * 1000)),
];
const packedVisitors = [
  profile("anon_packed_stay", 1000, { shuffleVisitor: true }),
  ...Array.from({ length: 5 }, (_, i) => profile(`anon_new_arrival_${i}`, 1000, { shuffleVisitor: true })),
];
const packedPlanned = planLiveVisitorSlots(packedWindow, packedVisitors, 35, NOW);
assert.equal(packedPlanned.length, 35, "full window keeps its size");
assert.equal(count(packedPlanned, (row) => row.shuffleVisitor), 6, "all six live anons receive cards");
assert.equal(new Set(packedPlanned.map((row) => row.uid)).size, 35, "no duplicate cards");
assert.ok(packedPlanned.some((row) => row.uid === "packed-registered-33") || packedPlanned.some((row) => row.uid === "packed-registered-0"), "registered discovery remains");
assert.deepEqual(planLiveVisitorSlots(packedPlanned, packedVisitors, 35, NOW).map((row) => row.uid), packedPlanned.map((row) => row.uid), "stable on next poll");

// 40 visitors cannot occupy 35 seats at once. Only truly new arrivals
// rotate in; polling the same pool a second time must not change the window.
const fortyLive = visitors.slice(0, 40);
const fullAnonSeats = fortyLive.slice(0, 35);
const newArrival = fortyLive[39];
const overflowPlan = planLiveVisitorSlots(fullAnonSeats, fortyLive, 35, NOW, {
  newVisitorIds: new Set([newArrival.uid]),
  random: () => 0.4,
});
assert.equal(overflowPlan.length, 35);
assert.ok(overflowPlan.some((row) => row.uid === newArrival.uid), "new anon gets a seat when >35");
const crowdedMixed = [
  ...fortyLive.slice(0, 16),
  ...Array.from({ length: 19 }, (_, i) => profile(`crowd_reg_${i}`, 60000)),
];
const crowdedUpdate = planLiveVisitorSlots(crowdedMixed, fortyLive, 35, NOW, {
  newVisitorIds: new Set(fortyLive.slice(16).map((row) => row.uid)),
  random: rng,
});
assert.equal(crowdedUpdate.length, 35);
assert.ok(count(crowdedUpdate, (row) => !row.shuffleVisitor) >= 10, "overcrowding preserves registered mix");
assert.ok(count(crowdedUpdate, (row) => row.shuffleVisitor) >= 16, "anon live entrants get priority");

const overflowStable = planLiveVisitorSlots(overflowPlan, fortyLive, 35, NOW, {
  newVisitorIds: new Set(),
  random: () => 0.9,
});
assert.deepEqual(overflowStable.map((p) => p.uid), overflowPlan.map((p) => p.uid), "poll cannot churn seats");

const refilled = planLiveVisitorSlots(
  [profile("anon_departed", 0, { shuffleVisitor: true }), profile("online_registered", 0)],
  [],
  3,
  NOW,
  { fillers: [profile("online_registered", 0), profile("replacement_registered", 0)] },
);
assert.deepEqual(refilled.map((p) => p.uid).sort(), ["online_registered", "replacement_registered"].sort(), "departure auto-fills vacancy");

const seededEmpty = planLiveVisitorSlots(
  [],
  [
    profile("anon_seed_1", 1000, { shuffleVisitor: true, username: "Anónimo" }),
    profile("anon_seed_2", 1000, { shuffleVisitor: true, username: "Anónimo" }),
  ],
  10,
  NOW,
);
assert.equal(seededEmpty.length, 2, "empty solo-online window still receives live anons");
assert.ok(seededEmpty.every((row) => row.shuffleVisitor));

const preferSolo = planLiveVisitorSlots(
  [
    profile("online-1", 60_000),
    profile("online-2", 90_000),
    profile("online-3", 120_000),
  ],
  Array.from({ length: 8 }, (_, i) =>
    profile(`anon_pref_${i}`, 1000, { shuffleVisitor: true, username: "Anónimo" }),
  ),
  10,
  NOW,
  { preferVisitors: true },
);
assert.ok(
  preferSolo.filter((row) => row.shuffleVisitor).length >= 7,
  "solo-online preferVisitors fills beyond the mixed-feed 45% cap",
);

const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");
assert.match(poolSrc, /Always sync visitors|preferVisitors: filters\.soloOnline|visitors=1/);
assert.match(poolSrc, /soloOnlineWindow/);
assert.match(poolSrc, /visibleVisitors\.length === 0/);
assert.match(poolSrc, /fetchShuffleVisitorsApi/);
assert.match(
  poolSrc,
  /previousVisitors|Keep existing live anons|cannot wipe solo-online visitors/,
  "applyPool preserves visitors across registered-pool overlays",
);
assert.match(
  poolSrc,
  /Rehydrate visitors after registered-pool load when solo-online/,
);
assert.match(
  fs.readFileSync(path.join(root, "src/app/api/shuffle/route.ts"), "utf8"),
  /A failed read must not freeze an empty list/,
);
assert.match(
  poolSrc,
  /Cached pool strips visitors\. Solo-online must fetch live anons BEFORE/,
);
assert.doesNotMatch(
  poolSrc,
  /if \(shouldSuppressShuffleNetworkAtFireTime\(\)\) return;\s*\n\s*const res = await fetchShuffleApi\("\/api\/shuffle\?visitors=1"/,
);
assert.doesNotMatch(
  poolSrc,
  /await fetchShuffleApi\(\s*`\/api\/shuffle\?visitors=1/,
  "visitor polls must use fetchShuffleVisitorsApi (no typing-guard)",
);
const guardSrc = fs.readFileSync(
  path.join(root, "src/lib/shuffle/shuffleSearchTypingGuard.ts"),
  "utf8",
);
assert.match(
  guardSrc,
  /export async function fetchShuffleVisitorsApi/,
  "visitors fetch bypasses typing-guard",
);
assert.match(
  guardSrc,
  /never blocked by search typing-guard/,
);
const alertsSrc = fs.readFileSync(path.join(root, "src/hooks/useGlobalChatAlerts.ts"), "utf8");
assert.match(alertsSrc, /countLocalPendingChats|whipPending/);
assert.match(
  alertsSrc,
  /forceAnonRecovery: pathname === \"\/chats\" && !documentHidden/,
);
assert.doesNotMatch(alertsSrc, /forceAnonRecovery: inboxRouteEnabled/);
assert.match(alertsSrc, /seenLatestMessageIdsRef/);
assert.match(alertsSrc, /showChatNotification/);
const inboxSrc = fs.readFileSync(path.join(root, "src/hooks/useChatsInbox.ts"), "utf8");
assert.match(
  inboxSrc,
  /Session registry seeding is \/chats-only/,
);
assert.match(inboxSrc, /if \(forceAnonRecovery\) \{\s*registerSessionChat/);
assert.match(inboxSrc, /Latch fallback only after success/);
assert.match(
  inboxSrc,
  /FALLBACK_ANON_RECOVERY_TTL_MS\s*=\s*25_000/,
  "fallback anon recovery re-polls on TTL",
);
assert.match(
  inboxSrc,
  /fallbackAnonRecoveryAtRef|fallbackAnonRecoveryEpoch/,
  "TTL latch allows Shuffle/Stories re-hydrate",
);
assert.match(
  inboxSrc,
  /without registerSessionChat \(keep session seeding \/chats-only\)/,
);
assert.doesNotMatch(
  inboxSrc,
  /if \(!forceAnonRecovery\) \{\s*registerSessionChat/,
  "fallback must not seed session chats",
);
assert.equal(
  (inboxSrc.match(/registerSessionChat\(/g) || []).length,
  1,
  "registerSessionChat only once (/chats force path)",
);
const notifSrc = fs.readFileSync(path.join(root, "src/lib/chat/chatNotifications.ts"), "utf8");
assert.match(notifSrc, /webChatNotifications/);
assert.match(notifSrc, /ensureChatNotifyServiceWorker/);
assert.match(notifSrc, /chat-notify\/sw\.js/);
assert.match(notifSrc, /pageNotificationConstructorSupported/);
assert.match(
  notifSrc,
  /isChatNotifyRegistration/,
  "must reject Monetag scope-/ registration from getRegistration(/chat-notify/)",
);
assert.match(
  notifSrc,
  /getRegistrations\(\)/,
  "must find chat-notify SW by scriptURL among all registrations",
);
assert.ok(
  fs.existsSync(path.join(root, "public/chat-notify/sw.js")),
  "chat-notify service worker must ship for Android Chrome/Brave banners",
);
assert.match(
  fs.readFileSync(path.join(root, "src/lib/chat/chatNotificationPrefs.ts"), "utf8"),
  /Notification\.permission === \"granted\"/,
);

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

const collapsed = collapseRowsByOwner(
  [
    { id: "a", owner: "person-1", seen: 10 },
    { id: "b", owner: "person-1", seen: 50 },
    { id: "c", owner: "person-2", seen: 20 },
  ],
  (row) => row.owner,
  (row) => row.seen,
);
assert.deepEqual(collapsed.map((row) => row.id), ["b", "c"]);

assert.equal(sanitizeShuffleVisitorChatId("anon_abc123_def"), "anon_abc123_def");
assert.equal(sanitizeShuffleVisitorChatId("anon_server"), "");
assert.equal(sanitizeShuffleVisitorChatId("firebaseUid"), "");
assert.ok(SHUFFLE_FRESH_MS < SHUFFLE_WEEK_MS);

const serverFilters = fs.readFileSync(
  path.join(root, "src/lib/shuffle/serverFilters.ts"),
  "utf8",
);
assert.match(
  serverFilters,
  /if \(profile\.shuffleVisitor === true\) \{/,
  "live anonymous sessions bypass demographic filters",
);
assert.match(
  serverFilters,
  /if \(filters\.soloOnline\) return isProfileOnline/,
  "solo online keeps live anonymous sessions",
);
const clientFilters = fs.readFileSync(path.join(root, "src/lib/shuffle/filters.ts"), "utf8");
assert.match(clientFilters, /shuffleVisitor: profile\.shuffleVisitor === true/);

console.log("shuffle-live-visitors: PASS");
