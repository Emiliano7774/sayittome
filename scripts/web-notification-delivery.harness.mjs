import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { mock } from "node:test";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

installHarnessAlias();
installHarnessWindow();
const routes = await import("../src/lib/chat/inboxListenerRoutes.ts");
for (const route of ["/", "/admin/usage", "/shuffle", "/chat/anon_1", "/stories", "/u/demo"]) {
  assert.equal(routes.shouldEnableChatNotificationListeners(route, true), true, route);
}
assert.equal(routes.shouldEnableChatNotificationListeners("/admin/usage", false), false);
assert.equal(routes.shouldEnableFullInboxListeners("/admin/usage"), false);

// Execute the actual production worker, including both incoming event paths.
const listeners = new Map();
const shown = [];
const visible = new Map();
let failNext = false;
const registration = {
  async getNotifications({ tag }) { return visible.has(tag) ? [visible.get(tag)] : []; },
  async showNotification(title, options) {
    if (failNext) { failNext = false; throw new Error("transient"); }
    shown.push({ title, ...options });
    visible.set(options.tag, { data: options.data });
  },
};
const worker = {
  registration,
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const src = fs.readFileSync(new URL("../public/chat-notify/sw.js", import.meta.url), "utf8");
vm.runInNewContext(src, { self: worker, URLSearchParams });
const data = { chatId: "fixture-chat", messageId: "message-1", title: "Anon", body: "Hola" };
function push(payload) {
  let task;
  listeners.get("push")({ data: { json: () => payload }, waitUntil(p) { task = p; } });
  return task;
}
function page(payload) {
  let task;
  let ack;
  listeners.get("message")({
    data: { type: "sayittome:show-chat-notification", title: payload.title,
      options: { body: payload.body, tag: `sayittome-chat-${payload.chatId}`, data: payload } },
    ports: [{ postMessage(value) { ack = value; } }],
    waitUntil(p) { task = p; },
  });
  return task.then(() => ack);
}
await Promise.all([push({ data }), page(data), page(data)]);
assert.equal(shown.length, 1, "one alert across push and multiple pages");
assert.equal(shown[0].renotify, true);
assert.equal(shown[0].silent, false);
await push({ data: { ...data, messageId: "message-2" } });
assert.equal(shown.length, 2, "identical text in a new message must notify again");
assert.equal(shown[0].tag, shown[1].tag, "preserve one notification per conversation");
await push({ data: { ...data, chatId: "another-chat" } });
assert.equal(shown.length, 3);
failNext = true;
const retryData = { ...data, messageId: "retry" };
assert.equal((await page(retryData)).ok, false);
assert.equal((await page(retryData)).ok, true);
assert.equal(shown.length, 4, "failed display does not consume an id");
// Simulate a worker restart: existing notifications prevent duplicate delivery.
vm.runInNewContext(src, { self: worker, URLSearchParams });
await push({ data: retryData });
assert.equal(shown.length, 4);
await push({ notification: { title: "Historia", body: "Nueva historia" }, data: { type: "story", href: "/stories" } });
assert.equal(shown.at(-1).data.href, "/stories", "non-chat pushes retain their navigation");

const { deliverWebChatNotification } = await import("../src/lib/chat/webNotificationDelivery.ts");
registration.active = {
  postMessage(data, ports) {
    listeners.get("message")({ data, ports, waitUntil(p) { void p; } });
  },
};
await deliverWebChatNotification(registration, "Anon", {
  tag: "sayittome-chat-fixture-chat", data: { ...data, messageId: "via-channel" },
});
assert.equal(shown.at(-1).data.messageId, "via-channel");
const before = shown.length;
await deliverWebChatNotification(registration, "Anon", {
  tag: "sayittome-chat-fixture-chat", data: { ...data, messageId: "via-channel" },
});
assert.equal(shown.length, before);
await deliverWebChatNotification({ showNotification: registration.showNotification }, "Old browser", { tag: "fallback" });
assert.equal(shown.at(-1).tag, "fallback");

const { startWebPushRegistrationRecovery } = await import("../src/lib/chat/webPushRegistrationRecovery.ts");
mock.timers.enable({ apis: ["setTimeout"] });
const events = new EventTarget();
const visibility = Object.assign(new EventTarget(), { hidden: false });
let allowed = true;
let active = false;
let attempts = 0;
const stop = startWebPushRegistrationRecovery({ events, visibility,
  ready: () => allowed, registered: () => active,
  register: async () => { attempts++; if (attempts === 1) throw new Error("offline"); active = true; },
});
await Promise.resolve(); await Promise.resolve();
assert.equal(attempts, 1, "register eagerly without inbox/auth profile hydration");
mock.timers.tick(5000); await Promise.resolve(); await Promise.resolve();
assert.equal(attempts, 2, "retry a transient failure");
events.dispatchEvent(new Event("focus"));
assert.equal(attempts, 2, "do not re-register an active current user");
active = false; allowed = false;
events.dispatchEvent(new Event("online"));
assert.equal(attempts, 2, "never register without granted permission");
allowed = true;
events.dispatchEvent(new Event("focus"));
await Promise.resolve(); await Promise.resolve();
assert.equal(attempts, 3, "recover a grant without reloading");
stop(); active = false;
events.dispatchEvent(new Event("focus")); mock.timers.tick(300000);
assert.equal(attempts, 3, "cleanup removes timers and events");
let permanentAttempts = 0;
const stopPermanent = startWebPushRegistrationRecovery({ events, visibility,
  ready: () => true, registered: () => false,
  register: async () => { permanentAttempts++; throw new Error("unavailable"); },
});
await Promise.resolve(); await Promise.resolve();
for (const delay of [5000, 30000, 120000, 300000]) {
  mock.timers.tick(delay); await Promise.resolve(); await Promise.resolve();
}
assert.equal(permanentAttempts, 4, "automatic retry is bounded");
stopPermanent();
let finishPending;
let concurrentAttempts = 0;
const stopPending = startWebPushRegistrationRecovery({ events, visibility,
  ready: () => true, registered: () => false,
  register: () => { concurrentAttempts++; return new Promise(resolve => { finishPending = resolve; }); },
});
events.dispatchEvent(new Event("focus")); events.dispatchEvent(new Event("online"));
assert.equal(concurrentAttempts, 1, "resume events do not duplicate an in-flight registration");
stopPending(); finishPending(); await Promise.resolve(); await Promise.resolve();
mock.timers.tick(300000);
assert.equal(concurrentAttempts, 1, "finishing after cleanup cannot schedule a retry");
mock.timers.reset();

const notification = await import("../src/lib/chat/chatNotifications.ts");
globalThis.Notification = class Notification { static permission = "granted"; };
assert.equal(notification.shouldShowChatNotification({ viewingActiveChat: true }), true);
window.Capacitor = { isNativePlatform: () => true };
assert.equal(notification.shouldShowChatNotification({ viewingActiveChat: true }), false,
  "native active-thread suppression remains unchanged");
delete window.Capacitor;
const manager = fs.readFileSync(new URL("../src/lib/chat/globalChatWhipManager.ts", import.meta.url), "utf8");
assert.match(manager, /suppress: viewingActiveChat && isCapacitorNative\(\)/);
const detail = fs.readFileSync(new URL("../src/hooks/useIncomingMessageWhip.ts", import.meta.url), "utf8");
assert.match(detail, /notifyIncomingChatMessage\(\{[\s\S]*?messageId: last.id/);
console.log("PASS web_notification_delivery: worker, dedupe, repeat, retry, routes, active-chat, recovery");
