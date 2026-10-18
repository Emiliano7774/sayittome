import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const policy = fs.readFileSync("functions/src/profileArrivalPolicy.ts", "utf8");
const js=ts.transpileModule(policy,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exported={};
vm.runInNewContext(js,{exports:exported,Number});
const gap=exported.REGISTERED_RETURN_GAP_MS;
const ok=exported.mayAnnounceRegisteredReturn;
const now=Date.parse("2026-10-15T18:30:00Z");
assert.equal(gap,60000);
for(const seconds of [0,1,30,59]){
 assert.equal(ok({nowMs:now,lastForegroundMs:now-seconds*1000,lastAnnouncementMs:0}),false,"short background return "+seconds+"s");
}
for(const seconds of [60,61,300,900,1800,7200]){
 assert.equal(ok({nowMs:now,lastForegroundMs:now-seconds*1000,lastAnnouncementMs:now-seconds*1000}),true,"reconnect allowed "+seconds+"s");
}
assert.equal(ok({nowMs:now,lastForegroundMs:0,lastAnnouncementMs:0}),true,"fresh registered entrance allowed");
assert.equal(ok({nowMs:now,lastForegroundMs:now-gap,lastAnnouncementMs:now-30*1000}),false,"server dedup across tabs");
assert.equal(ok({nowMs:now,lastForegroundMs:now-40*1000,lastAnnouncementMs:now-30*60000}),false,"other active tab/device blocks duplicate");
assert.equal(ok({nowMs:now,lastForegroundMs:now+40000,lastAnnouncementMs:0}),false,"future foreground timestamps denied");
const service=fs.readFileSync("src/services/presence.ts","utf8");
assert.match(service,/lastForegroundAt: serverTimestamp\(\)/,"existing 90s profile heartbeat carries foreground timestamp");
assert.match(service,/if \(uid !== currentUid \|\| !foregroundActive\) return;/,"background does not renew heartbeat");
assert.match(service,/if \(!justReturned\(uid\)\)/,"sub-60s local fast return never calls service");
assert.match(service,/if \(priorExit\) await priorExit\.catch/,"fast return awaits pending departure");
assert.match(service,/isNativeAppShell\(\) \? nativeAppActive : windowFocused/,"native resume supported without window focus");
assert.match(service,/window\.addEventListener\("beforeunload"/,"reload guards");
assert.match(service,/saveLastExit\(uid\)/,"session-independent persistent departure guard");
assert.match(service,/if \(currentUid && foregroundActive\) void enterForeground\(currentUid\)/,"authenticated profiles only");
const fn=fs.readFileSync("functions/src/anonArrivalPush.ts","utf8");
assert.match(fn,/tx\.get\(profileRef\)/,"server reads prior foreground inside transaction");
assert.match(fn,/tx\.get\(gate\)/,"server reads same user's broadcast gate");
assert.match(fn,/mayAnnounceRegisteredReturn/);
assert.match(fn,/sign_in_provider === "anonymous"/,"no anon-to-profile conversion");
assert.doesNotMatch(fn.slice(fn.indexOf("export const announceProfileArrival"),fn.indexOf("export const adminSendAvailableAnonAlert")),/mostrarUltimaVez === false/,"last-seen preference cannot suppress registered arrival notices");
assert.match(fn,/type:"anon_arrival"/,"anonymous arrival path unaffected");
assert.match(fn,/type:"profile_arrival"/,"registered arrival uses existing topic");
console.log("PASS PROFILE RETURN PILOT: 19 time scenarios, 60s boundary, concurrent tabs, foreground-only heartbeat, reload/native/privacy/anon contract");
