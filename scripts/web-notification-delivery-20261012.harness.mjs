import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { MessageChannel } from "node:worker_threads";
import { deliverWebChatNotification, waitForWebNotificationWorker } from "../src/lib/chat/webNotificationDelivery.ts";

globalThis.MessageChannel = MessageChannel;
const workerSource = fs.readFileSync(new URL("../public/chat-notify/sw.js", import.meta.url), "utf8");
function fixture({ existing = [], delay = 0 } = {}) {
  const handlers = {}, shown = [], relayed = [], visible = [...existing];
  const registration = {
    scope: "https://example.test/chat-notify/",
    getNotifications: async ({ tag }) => visible.filter(n => n.tag === tag),
    showNotification: async (title, options) => {
      if (delay) await new Promise(r => setTimeout(r, delay));
      shown.push({ title, ...options });
      const old = visible.findIndex(n => n.tag === options.tag);
      if (old >= 0) visible.splice(old, 1);
      visible.push(options);
    },
  };
  const self = {
    registration, skipWaiting: async () => {},
    addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: { claim: async () => {}, matchAll: async () => [
      { visibilityState: "visible", postMessage: data => relayed.push(data) },
      { visibilityState: "hidden", postMessage: () => assert.fail("hidden relay") },
    ] },
  };
  vm.runInNewContext(workerSource, { self, URLSearchParams });
  registration.active = { scriptURL: "https://example.test/chat-notify/sw.js",
    postMessage: (data, ports) => handlers.message({ data, ports, waitUntil: p => p.catch(e => { throw e; }) }),
  };
  const push = data => new Promise((resolve, reject) => handlers.push({
    data: { json: () => ({ data }) }, waitUntil: p => p.then(resolve, reject),
  }));
  return { registration, shown, relayed, push, visible };
}
const payload = messageId => ({ type: "chat_message", chatId: "fixture-chat", messageId,
  recipientUid: "receiver", title: "Peer", body: "Same text" });
const options = messageId => ({ tag: "sayittome-chat-fixture-chat", data: payload(messageId), body: "Same text", renotify: true });
const test = fixture();
await Promise.all([
  deliverWebChatNotification(test.registration, "Peer", options("one")),
  test.push(payload("one")),
]);
await test.push(payload("two"));
await deliverWebChatNotification(test.registration, "Peer", options("three"));
await test.push(payload("two"));
assert.deepEqual(test.shown.map(n => n.data.messageId), ["one", "two", "three"]);
assert.ok(test.shown.every(n => n.renotify === true && n.silent === false));
assert.equal(test.relayed.length, 3, "preserve verified-recipient foreground relay; page dedupes it");
const restarted = fixture({ existing: test.visible });
await restarted.push(payload("three"));
assert.equal(restarted.shown.length, 0, "worker restart does not replay visible latest message");

// Advance only watchdog timeouts. A late acknowledged display must not fall
// back to direct showNotification and produce two popups.
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, ms === 5000 || ms === 350 ? 12 : ms, ...args);
try {
  const delayed = fixture({ delay: 50 });
  assert.equal(await deliverWebChatNotification(delayed.registration, "Peer", options("slow")), "pending");
  await new Promise(r => realTimeout(r, 80));
  assert.equal(delayed.shown.length, 1, "late worker response must not duplicate");
  let direct = 0;
  const old = { active: { postMessage() {} }, showNotification: async () => { direct++; } };
  assert.equal(await deliverWebChatNotification(old, "Peer", options("old-worker")), "shown");
  assert.equal(direct, 1, "unsupported protocol uses side-effect-free probe then direct fallback");
  const installing = { state: "installing", addEventListener() {}, removeEventListener() {} };
  assert.equal(await waitForWebNotificationWorker({ installing }), null, "activation wait is bounded");
} finally { globalThis.setTimeout = realTimeout; }

// Execute the actual registration function against an update that never ends.
// The already-active worker must remain immediately usable.
const source = fs.readFileSync(new URL("../src/lib/chat/chatNotifications.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exports = {};
const active = fixture().registration;
active.update = () => new Promise(() => {});
vm.runInNewContext(code, { exports, URL, console, setTimeout, clearTimeout,
  window: { location: { origin: "https://example.test" } },
  navigator: { serviceWorker: { getRegistrations: async () => [active] } },
  require: name => name.endsWith("webNotificationDelivery") ? { deliverWebChatNotification, waitForWebNotificationWorker }
    : name.endsWith("notificationIncident") ? { recordNotificationStage() {} } : {},
});
let deadline;
try {
  const winner = await Promise.race([exports.ensureChatNotifyServiceWorker(), new Promise(r => { deadline = setTimeout(() => r("blocked"), 100); })]);
  assert.equal(winner, active, "active delivery must not wait for worker network update");
} finally { clearTimeout(deadline); }
assert.match(source, /renotify: true/);
assert.match(workerSource, /data\.type !== "anon_direct_message" && data\.inboxKind !== "anon_direct"/);
console.log("PASS worker_delivery: three messages, same-text renotify, concurrent page/push dedupe, restart, late ACK, upgrade, bounded activation, nonblocking update, relay/click preserved");
