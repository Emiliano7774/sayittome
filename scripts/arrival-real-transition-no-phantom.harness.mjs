import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const source=readFileSync("src/lib/anonMatch/anonArrival.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports,Date,Number,String});
const reconnection=exports.isNewAnonymousArrival;
const instant=Date.parse("2026-10-23T20:00:00.000Z");
const at=ms=>new Date(ms).toISOString();
assert.equal(reconnection({nowMs:instant}),true,"new anon first entry");
for(let i=1;i<=50;i++){
 const now=instant+i*90_000;
 const previous=now-90_000;
 assert.equal(reconnection({nowMs:now,priorLastSeenAt:at(previous),priorAnnouncedAt:at(instant),priorBackgrounded:false,priorSessionClosed:false}),false,"continuous foreground 90s heartbeat must NEVER broadcast, cycle "+i);
}
for(let i=1;i<=20;i++){
 const now=instant+i*121_000;
 const prior=now-61_000;
 assert.equal(reconnection({nowMs:now,priorLastSeenAt:at(prior),priorAnnouncedAt:at(now-121_000),priorBackgrounded:true,priorSessionClosed:false}),true,"real foreground return after 61s always valid, cycle "+i);
 assert.equal(reconnection({nowMs:now,priorLastSeenAt:at(now-59_000),priorAnnouncedAt:at(now-121_000),priorBackgrounded:true,priorSessionClosed:false}),false,"59s return suppressed");
}
assert.equal(reconnection({nowMs:instant+180_000,priorLastSeenAt:at(instant),priorAnnouncedAt:at(instant),priorBackgrounded:undefined,priorSessionClosed:false}),false,"old client without background marker cannot trigger false positive");
assert.equal(reconnection({nowMs:instant+180_000,priorLastSeenAt:at(instant),priorAnnouncedAt:at(instant),priorBackgrounded:false,priorSessionClosed:true,priorSessionClosedAt:at(instant+119_000)}),true,"closed return after 61s");
const route=readFileSync("src/app/api/anonymous-presence/route.ts","utf8");
assert.match(route,/priorBackgrounded:\s*existing\?\.backgrounded/);
assert.match(route,/const mayAnnounce = !backgrounded/);
const client=readFileSync("src/services/anonymousPresence.ts","utf8");
assert.match(client,/if \(!anonymousForegroundActive\(\)\) return/);
assert.match(client,/document\.addEventListener\("visibilitychange"/);
assert.match(client,/backgrounded = !anonymousForegroundActive\(\)/);
assert.match(client,/backgrounded \? \{ keepalive: true \}/);
console.log("PASS: 50 uninterrupted 90s beats suppressed; 20 legit 61s reconnects accepted, <60s refused, closed session, old clients, existing no-cost presence route");