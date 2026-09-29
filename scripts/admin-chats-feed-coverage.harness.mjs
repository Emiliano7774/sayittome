/**
 * ADMIN_CHATS_FEED_COVERAGE — authoritative merge must not drop chats outside
 * the live top-N window; missing moderation_profiles must not hide owners;
 * legacy participant UIDs must aggregate; never filter by admin initiator.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const classic = await import(
  pathToFileURL(path.join(root, "src/lib/moderation/classicFeed.ts")).href
);
const history = await import(
  pathToFileURL(path.join(root, "src/lib/moderation/chatHistory.ts")).href
);
const feedSrc = fs.readFileSync(
  path.join(root, "src/hooks/useClassicModerationFeed.ts"),
  "utf8",
);
const routeSrc = fs.readFileSync(
  path.join(root, "src/app/api/admin/chats-feed/route.ts"),
  "utf8",
);
const hubSrc = fs.readFileSync(
  path.join(root, "src/components/admin/spectator/SpectatorModerationHub.tsx"),
  "utf8",
);
const fetchSrc = fs.readFileSync(
  path.join(root, "src/lib/moderation/fetchUserChats.ts"),
  "utf8",
);

function row(id, extras = {}) {
  return history.normalizeModerationChatRow({
    id,
    updatedAtMs: extras.updatedAtMs ?? Date.now(),
    lastMessage: extras.lastMessage ?? `msg-${id}`,
    ...extras,
  });
}

// a) >80 chats: one outside top80 still present after authoritative merge
{
  const authoritative = [];
  for (let i = 0; i < 120; i += 1) {
    authoritative.push(
      row(`chat-${i}`, {
        targetUsername: `user_${i}`,
        receptorUsername: `user_${i}`,
        receptorUid: `uid_${String(i).padStart(28, "x")}`,
        updatedAtMs: 1_000_000 - i,
      }),
    );
  }
  const recentLive = authoritative.slice(0, 80);
  const merged = classic.mergeChatsById(authoritative, recentLive);
  assert.equal(merged.length, 120);
  assert.ok(merged.some((c) => c.id === "chat-119"));
  const feed = classic.aggregateChatsToUserFeed(merged, {}, {});
  assert.ok(feed.some((e) => e.username === "user_119"));
  assert.ok(feed.length >= 120);
}

// b) missing moderation_profiles does not hide chat-derived owners
{
  const chats = [
    row("old-1", {
      targetUsername: "ghost_owner",
      receptorUsername: "ghost_owner",
      updatedAtMs: 50,
    }),
  ];
  const chatFeed = classic.aggregateChatsToUserFeed(chats, {}, {});
  const merged = classic.mergeModerationFeed([], chatFeed, {});
  assert.ok(merged.some((e) => e.username === "ghost_owner"));
  assert.equal(merged.find((e) => e.username === "ghost_owner")?.chatCount, 1);
}

// c) legacy participant-only uid aggregates into feed
{
  const profileUid = "AaBbCcDdEeFfGgHhIiJjKkLlMmNo";
  const legacy = row("legacy-1", {
    updatedAtMs: 99,
    lastMessage: "legacy hello",
    participantes: ["anon_visitor_xyz", profileUid],
  });
  assert.equal(history.chatBelongsToProfile(legacy, "Ada", profileUid), true);
  assert.ok(history.discoveryOwnerUids(legacy).includes(profileUid));
  const feed = classic.aggregateChatsToUserFeed([legacy], {}, {
    [profileUid]: "Ada",
  });
  assert.ok(feed.some((e) => e.username === "Ada" && e.lastChatId === "legacy-1"));
}

// d) admin global feed must not filter by initiator/admin UID
{
  assert.match(routeSrc, /verifyAdminIdToken/);
  assert.match(routeSrc, /buildAuthoritativeAdminChatsFeed/);
  assert.doesNotMatch(feedSrc, /initiatorUid\s*===\s*auth\.currentUser/);
  assert.doesNotMatch(feedSrc, /filter\(.*admin/i);
  const chats = [
    row("a1", {
      targetUsername: "victim",
      initiatorUid: "some_random_user_uid_abcdefgh",
      updatedAtMs: 10,
    }),
    row("a2", {
      targetUsername: "victim2",
      initiatorUid: "admin_uid_should_not_matter_xx",
      updatedAtMs: 11,
    }),
  ];
  const feed = classic.aggregateChatsToUserFeed(chats, {}, {});
  assert.equal(feed.length, 2);
}

// e) dedupe by chatId: recent-live updates win when newer
{
  const auth = [row("same", { targetUsername: "U", updatedAtMs: 10, lastMessage: "old" })];
  const live = [row("same", { targetUsername: "U", updatedAtMs: 20, lastMessage: "new" })];
  const merged = classic.mergeChatsById(auth, live);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].lastMessage, "new");
}

// Wiring: authoritative fetch + merge, not replace-by-top80
assert.match(feedSrc, /\/api\/admin\/chats-feed/);
assert.match(feedSrc, /mergeChatsById/);
assert.match(feedSrc, /setRecentLiveChats\(\(prev\) => mergeChatsById\(prev, rows\)\)/);
assert.doesNotMatch(feedSrc, /setInterval\(\(\) => \{\s*void loadAuthoritative/);
assert.doesNotMatch(feedSrc, /AUTHORITATIVE_REFRESH_MS/);
assert.match(hubSrc, /authoritativeTotal|Catálogo admin/);
assert.match(fetchSrc, /array-contains/);
assert.match(fetchSrc, /participantes/);

// UID resolve policy: never initiator; minimize named profile-anon
{
  const feedLib = fs.readFileSync(
    path.join(root, "src/lib/moderation/adminChatsFeed.ts"),
    "utf8",
  );
  assert.match(feedLib, /Never add initiatorUid|never add initiatorUid/i);
  assert.match(feedLib, /needsParticipantResolve/);
  const hist = fs.readFileSync(
    path.join(root, "src/lib/moderation/chatHistory.ts"),
    "utf8",
  );
  assert.match(hist, /profile_/);
  assert.match(hist, /\{8,128\}/);
}

console.log(
  JSON.stringify({
    gate: "ADMIN_CHATS_FEED_COVERAGE",
    pass: true,
    covers: [
      "outside-top80-present",
      "missing-moderation-profiles",
      "legacy-participant-uid",
      "no-admin-initiator-filter",
      "dedupe-chatId",
    ],
  }),
);
