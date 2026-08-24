/**
 * CHAT_NOTIFICATION_OPEN_FIRST_FRAME
 * Push/deep-link open: seed cache, never empty intermediate, scrollBottom before reveal.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const open = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatNotificationOpen.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);
const history = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatHistoryPages.ts")).href
);

cache.clearCachedChatMessages();

// Cache miss: seed from payload before paint.
const seeded = open.markChatOpenedFromNotification({
  chatId: "chat_push_1",
  messageId: "msg_99",
  body: "hola desde push",
  title: "Ana",
});
assert.ok(seeded);
const warm = cache.readCachedChatMessages("chat_push_1");
assert.ok(warm?.length);
assert.equal(warm[warm.length - 1].id, "msg_99");
assert.equal(warm[warm.length - 1].text, "hola desde push");

const href = open.buildChatNotificationOpenHref({
  chatId: "chat_push_1",
  messageId: "msg_99",
});
assert.match(href, /from=push/);
assert.match(href, /mid=msg_99/);

assert.equal(open.isChatOpenedFromNotification("chat_push_1"), true);
const consumed = open.consumeChatNotificationOpen("chat_push_1");
assert.equal(consumed?.messageId, "msg_99");
assert.equal(open.peekChatNotificationOpen(), null);

// Warm: existing cache kept; missing target still upserted.
cache.writeCachedChatMessages("chat_push_2", [
  { id: "m1", text: "old", createdAtMs: 1 },
  { id: "m2", text: "mid", createdAtMs: 2 },
]);
open.markChatOpenedFromNotification({
  chatId: "chat_push_2",
  messageId: "m3",
  body: "nuevo",
});
const rows2 = cache.readCachedChatMessages("chat_push_2");
assert.equal(rows2.length, 3);
assert.equal(rows2[2].id, "m3");

// Scroll before reveal.
const scroller = { scrollTop: 0, scrollHeight: 2400, clientHeight: 700 };
assert.equal(open.isChatScrollAtBottom(scroller), false);
assert.equal(open.applyChatScrollBottomExact(scroller), true);
assert.equal(scroller.scrollTop, 1700);
assert.equal(
  open.shouldHoldChatRevealUntilScrollBottom({
    fromNotification: true,
    messageCount: 3,
  }),
  true,
);
assert.equal(
  open.shouldHoldChatRevealUntilScrollBottom({
    fromNotification: false,
    messageCount: 3,
  }),
  false,
);

// Live merge out-of-order must not empty or drop older.
const merged = open.mergeNotificationHydrateWithoutEmpty(
  [
    { id: "a", text: "1" },
    { id: "b", text: "2" },
  ],
  [
    { id: "b", text: "2b" },
    { id: "c", text: "3" },
  ],
);
assert.deepEqual(
  merged.map((row) => row.id),
  ["a", "b", "c"],
);
assert.equal(merged.find((row) => row.id === "b").text, "2b");

const live = history.mergeLiveWindowIntoHistory(
  [
    { id: "old1" },
    { id: "old2" },
    { id: "live1" },
  ],
  [{ id: "live1" }, { id: "live2" }],
  [],
  (loaded) => loaded,
);
assert.deepEqual(
  live.map((row) => row.id),
  ["old1", "old2", "live1", "live2"],
);

// Autoscroll for push ignores intro block.
assert.equal(
  open.shouldAutoscrollChatNotificationOpen({
    fromNotification: true,
    stickToBottom: true,
    showIntro: true,
  }),
  true,
);
assert.equal(
  open.shouldAutoscrollChatNotificationOpen({
    fromNotification: false,
    stickToBottom: true,
    showIntro: true,
  }),
  false,
);

const plan = open.resolvePushChatOpenPlan({
  chatId: "chat_x",
  authed: true,
  messageId: "m9",
});
assert.equal(plan.kind, "open");
assert.match(plan.href, /from=push/);

const queued = open.resolvePushChatOpenPlan({
  chatId: "chat_x",
  authed: false,
});
assert.equal(queued.kind, "queue");

// Wiring: FCM/local/web + ProfileAnonChat reveal gate.
const fcmSrc = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");
assert.match(fcmSrc, /markChatOpenedFromNotification/);
assert.match(fcmSrc, /openChatDeepLink\(\{/);
assert.match(fcmSrc, /data\.messageId/);

const notifSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/chatNotifications.ts"),
  "utf8",
);
assert.match(notifSrc, /markChatOpenedFromNotification/);
assert.match(notifSrc, /buildChatNotificationOpenHref/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /threadRevealReady/);
assert.match(chatSrc, /applyChatScrollBottomExact/);
assert.match(chatSrc, /prefetchChatThreadAsync/);
assert.match(chatSrc, /data-chat-notif-reveal/);
assert.match(chatSrc, /mergeNotificationHydrateWithoutEmpty/);

const fnSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnSrc, /body: String\(body/);
assert.match(fnSrc, /title: String\(title/);

const prefetchSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/prefetchChatThread.ts"),
  "utf8",
);
assert.match(prefetchSrc, /prefetchChatThreadAsync/);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_NOTIFICATION_OPEN_FIRST_FRAME",
      pass: true,
      cacheMissSeed: true,
      scrollBeforeReveal: true,
      liveMergeSafe: true,
    },
    null,
    2,
  ),
);
