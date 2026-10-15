import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const swSource = readFileSync(new URL("public/chat-notify/sw.js", root), "utf8");
const nativeSource = readFileSync(new URL("src/lib/chat/fcmPush.ts", root), "utf8");
const toastSource = readFileSync(new URL("src/components/anonMatch/AnonArrivalToast.tsx", root), "utf8");
assert.match(nativeSource, /displayedNativeArrivals\.has\(arrivalKey\)/);
assert.match(nativeSource, /anon_arrival" && document\.visibilityState === "visible"/);
assert.match(toastSource, /getAnonArrivalPushPreference\(viewerUid\)/);
assert.match(toastSource, /sayittome:anon-arrival-prefs/);

async function runCase({ types, visible = false, expected }) {
  const listeners = {};
  const notices = [];
  const existing = [];
  const registration = {
    getNotifications: async ({ tag }) => existing.filter((n) => n.tag === tag),
    showNotification: async (title, opts) => {
      notices.push({title, opts});
      existing.push({tag:opts.tag, data:opts.data});
    },
  };
  const sw = {
    addEventListener: (type, callback) => {listeners[type] = callback;},
    registration,
    clients: {
      matchAll: async () => visible ? [{visibilityState:"visible"}] : [],
    },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(swSource, {self:sw, URLSearchParams, Promise, String, Boolean, Set}, {filename:"chat-notify/sw.js"});
  const waits = [];
  for (const x of types) {
    const data = {type:x.type, tag:x.tag, href:x.href || "/?anonArrival=anon_test123", body:"Tocá para hablarle"};
    const event = {data:{json:()=>({data})}, waitUntil:(promise)=>waits.push(promise)};
    listeners.push(event);
  }
  await Promise.all(waits);
  assert.equal(notices.length, expected, JSON.stringify({types, visible, notices}));
}
const arrival = {type:"anon_arrival", tag:"stm-arrival-fixed"};
await runCase({types:[arrival,arrival], expected:1});
await runCase({types:[arrival,arrival], visible:true, expected:0});
const profile = {type:"profile_arrival", tag:"stm-profile-fixed"};
await runCase({types:[profile,profile], expected:1});
await runCase({types:[profile,profile], visible:true, expected:1});
await runCase({types:[arrival,{...arrival,tag:"stm-arrival-different"}], expected:2});
await runCase({types:[{type:"chat_message",tag:"chat-a"},{type:"chat_message",tag:"chat-b"}], expected:2});
console.log("PASS CONNECTION ARRIVAL DEDUPE: 6 runtime cases + native/toast owner assertions");
