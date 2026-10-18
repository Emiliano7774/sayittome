import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exported={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/anonMatch/anonArrival.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,Date,Number,Math,String});
const now=Date.parse("2026-10-18T20:00:00Z");
const alias=(age,extra={})=>({nowMs:now,priorLastSeenAt:new Date(now-age*1000).toISOString(),priorAnnouncedAt:new Date(now-age*1000).toISOString(),...extra});
assert.equal(exported.ANON_ARRIVAL_MIN_REANNOUNCE_MS,60000);
assert.equal(exported.ANON_ARRIVAL_FRESH_MS,60000);
assert.equal(exported.isNewAnonymousArrival({nowMs:now}),true,"first arrival");
for(const s of [0,10,59]) {
 assert.equal(exported.isNewAnonymousArrival(alias(s)),false,"short absence "+s);
 assert.equal(exported.isNewAnonymousArrival(alias(s,{priorSessionClosed:true,priorSessionClosedAt:new Date(now-s*1000).toISOString()})),false,"short explicit close "+s);
}
for(const s of [60,61,120,180]) {
 assert.equal(exported.isNewAnonymousArrival(alias(s)),true,"long absence "+s);
 assert.equal(exported.isNewAnonymousArrival(alias(s,{priorSessionClosed:true,priorSessionClosedAt:new Date(now-s*1000).toISOString()})),true,"closed and returned "+s);
}
assert.equal(exported.isNewAnonymousArrival(alias(62,{priorAnnouncedAt:new Date(now-45000).toISOString()})),false,"last broadcast under 60s");
assert.equal(exported.isNewAnonymousArrival(alias(120,{priorSessionClosed:true,priorSessionClosedAt:new Date(now-25000).toISOString()})),false,"closed only 25s ago");
assert.equal(exported.isNewAnonymousArrival(alias(120,{priorSessionClosed:true,priorSessionClosedAt:new Date(now-60000).toISOString()})),true,"closed exactly 60s ago");
const route=fs.readFileSync("src/app/api/anonymous-presence/route.ts","utf8");
const fn=fs.readFileSync("functions/src/anonArrivalPush.ts","utf8");
assert(route.includes("sessionClosedAt: new Date().toISOString()"),"real departure stored");
assert(route.includes("priorSessionClosedAt: existing?.sessionClosedAt"),"real departure checked");
assert(route.includes("const mayAnnounce = !backgrounded"),"background writes do not announce");
assert(fn.includes("const ANON_PUSH_DEDUPE_MS = 60_000"),"server anon topic push 60s");
assert(fn.includes('adminGhostArrivalEnabled === true'),"owner ghost button authoritative");
assert(!fn.includes('reason:"administrator_excluded"'),"owner can opt to appear through switch");

const privacy=fs.readFileSync("src/lib/profile/lastSeenVisibility.ts","utf8");
assert(privacy.includes("!profile || !isLastSeenPublic(profile)"),"hidden excluded Solo online");
const refresh=fs.readFileSync("src/lib/shuffle/refreshPresence.ts","utf8");
assert(!refresh.includes("stripPublicPresence"),"hidden still retains green general shuffle");
const original=fs.readFileSync("src/lib/anonMatch/anonymousPresenceIdentity.ts","utf8");
assert(original.includes("3 * 60 * 60")||original.includes("3 * 60 * 60_000")||original.includes("3 * 60 * 60 * 1000"),"three hour anon membership");
console.log("PASS: all 60-second anon return cases, privacy Solo-online exclusion, green general, admin control, 3h anon cards");
