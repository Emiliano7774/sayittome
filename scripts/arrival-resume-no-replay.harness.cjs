// Regression test for dismissed connection arrivals across tab / WebView rehydration.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const persistent = new Map();
let ephemeral = new Map();
const store = (map) => ({getItem:(k)=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)});
global.window = {localStorage:store(persistent),sessionStorage:store(ephemeral)};
const source = fs.readFileSync("src/lib/anonMatch/arrivalToastReceipt.ts","utf8");
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function moduleLoad() {
  const m={exports:{}};
  new Function("module","exports",code)(m,m.exports);
  return m.exports;
}
const now = Date.now(), alias = "anon_testabc123", person = "profile_arrival:testperson";
let receipts = moduleLoad();
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1",alias,"2026-10-15T16:00:00Z",now),true);
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1",alias,"2026-10-15T16:00:00Z",now+200),false);
ephemeral = new Map(); // Android WebView / browser tab recreation
global.window.sessionStorage = store(ephemeral);
receipts = moduleLoad();
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1",alias,"2026-10-15T16:00:00Z",now+2000),false,
  "same viewer: cached Firestore latest replayed after navigation");
assert.equal(receipts.consumeAnonArrivalToastOnce("rotated-anonymous-uid",alias,"2026-10-15T16:00:01Z",now+2200),false,
  "viewer UID rotation re-showed the same person");
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1","anon_another123","2026-10-15T16:00:02Z",now+2300),true,
  "another person should be eligible");
receipts.markAnonArrivalActionHandled("","anon_deeplink1",now+2500);
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1","anon_deeplink1","2026-10-15T16:00:03Z",now+2600),false,
  "deeplink handled before auth hydration reappeared");
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer1",person,now+3000),true);
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer1",person,now+3300),false);
ephemeral = new Map();
global.window.sessionStorage=store(ephemeral);
receipts=moduleLoad();
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer1",person,now+5000),false,
  "profile banner reappeared after WebView restart");
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer2",person,now+6000),false,
  "profile banner reappeared after viewer session switch");
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer1","profile_arrival:other",now+6000),true);
assert.equal(receipts.consumeForegroundConnectionNoticeOnce("viewer1",person,now+15*60_000+3001),true,
  "genuine return after reannounce cooldown should be eligible");
assert.equal(receipts.consumeAnonArrivalToastOnce("viewer1",alias,"2026-10-15T16:17:00Z",now+15*60_000+3001),true,
  "genuine later anonymous arrival should remain possible");
const toast=fs.readFileSync("src/components/anonMatch/AnonArrivalToast.tsx","utf8");
assert.match(toast,/const listeningSince = Date\.now\(\)/);
assert.match(toast,/if\(entered < listeningSince - 1_000\) return/);
assert.match(toast,/if\(document\.hidden\) setArrival\(null\)/);
const fcm=fs.readFileSync("src/lib/chat/fcmPush.ts","utf8");
assert.match(fcm,/const NATIVE_ARRIVAL_DEDUPE_MS = 15 \* 60_000/);
assert.match(fcm,/consumeForegroundConnectionNoticeOnce\(viewerUid,/);
assert.match(fcm,/consumeForegroundConnectionNoticeOnce\(\s*asId\(auth.currentUser\?\.uid\), arrivalKey, permittedAt,/);
console.log("PASS arrival resume: cached latest ignored; localStorage survives WebView; changed auth UID; deeplink before auth; FCM web/native dedupe; distinct person + valid return preserved.");
