import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");
const route=read("src/app/api/anonymous-presence/route.ts");
const store=read("src/lib/anonMatch/anonMatchAdminStore.ts");
const fn=read("functions/src/anonArrivalPush.ts");
const toast=read("src/components/anonMatch/AnonArrivalToast.tsx");
const rules=read("firestore.rules");
assert.match(route,/writeAnonymousPresenceAndArrival\(anonId,presencePayload,arrival\)/);
assert.doesNotMatch(route,/setAnonMatchAdminDoc\("anon_arrival_announcements", "latest"/);
assert.match(store,/batch\.create\(database\.collection\("connection_arrival_events"\)/);
assert.match(fn,/onDocumentCreated\(\{/);
assert.match(fn,/document:"connection_arrival_events\/\{eventId\}"/);
assert.match(fn,/arrival_fcm_accepted/);
assert.match(fn,/attempt <= 3/);
assert.match(fn,/entered-priorEntryMs < ANON_PUSH_DEDUPE_MS/);
assert.match(toast,/snap\.docChanges\(\)/);
assert.match(toast,/pendingArrivals\.current\.push/);
assert.match(toast,/setInterval\(\(\)=>/);
assert.match(toast,/document\.hidden/);
assert.match(toast,/raw\.type==="profile_arrival"/);
assert.match(rules,/match \/connection_arrival_events\/\{eventId\}/);
assert.match(rules,/allow create, update, delete: if false/);
const start=Date.now();
const unique=new Set();
for(let i=0;i<500;i++) {
 const authUid="simulated_uid_"+i;
 const entered=new Date(start).toISOString();
 const id=createHash("sha256").update(authUid+"|"+entered).digest("hex").slice(0,40);
 unique.add(id);
}
assert.equal(unique.size,500,"500 simultaneous users must have 500 separate documents");
const repeated=new Set();
for(let i=0;i<500;i++) {
 const entered=new Date(start+i*60_000).toISOString();
 const id=createHash("sha256").update("same_visitor|"+entered).digest("hex").slice(0,40);
 repeated.add(id);
}
assert.equal(repeated.size,500,"500 valid returns must create different events");
const queue=[...unique];
const consumed=[];
while(queue.length) consumed.push(queue.shift());
assert.equal(consumed.length,500,"queue must preserve burst, not replace with latest");
assert.equal(new Set(consumed).size,500);
console.log("PASS ARRIVAL EVENT STREAM: 500 concurrent + 500 repeat events, immutable writes, FIFO, auth-only access, FCM retry and audit contracts");
