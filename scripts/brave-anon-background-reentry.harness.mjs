import assert from "node:assert/strict";
import { isNewAnonymousArrival } from "../src/lib/anonMatch/anonArrival.ts";
import fs from "node:fs";
const server = fs.readFileSync("src/app/api/anonymous-presence/route.ts", "utf8");
const client = fs.readFileSync("src/services/anonymousPresence.ts", "utf8");
const now=Date.parse("2026-10-19T20:00:00.000Z");
const ago=ms=>new Date(now-ms).toISOString();
const base=(extras={})=>({
 nowMs: now,
 priorSessionClosed: false,
 priorLastForegroundAt: ago(120_000),
 priorLastSeenAt: ago(10),
 priorAnnouncedAt: ago(5*60_000),
 ...extras
});
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:true,priorBackgroundedAt:ago(59_999)})), false,
  "59.999 seconds in WhatsApp is not enough");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:true,priorBackgroundedAt:ago(60_000)})), true,
  "60-second background interval must announce even if a hidden heartbeat just updated lastSeenAt");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:true,priorBackgroundedAt:ago(61_000)})), true,
  "61s away in Brave");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:true,priorBackgroundedAt:ago(61_000),priorAnnouncedAt:ago(58_000)})), false,
  "server broadcast cooldown stays intact");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:false,resumedFromAt:ago(61_000)})), true,
  "browser can announce reentry if its hidden fetch was dropped or delayed");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:false,resumedFromAt:ago(59_000)})), false,
  "short local resume does not announce");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:false,priorLastForegroundAt:ago(10_000),resumedFromAt:ago(61_000)})), false,
  "fresh prior foreground write rejects stale/malicious resume");
assert.equal(isNewAnonymousArrival(base({priorBackgrounded:false,priorLastSeenAt:ago(90_000),priorLastForegroundAt:ago(90_000)})), false,
  "90-second heartbeat is not a connection");
assert.equal(isNewAnonymousArrival(base({priorSessionClosed:true,priorSessionClosedAt:ago(61_000)})), true,
  "explicitly closed tab still reannounces after a minute");
assert.equal(isNewAnonymousArrival(base({priorSessionClosed:true,priorSessionClosedAt:ago(59_000)})), false,
  "explicit close under a minute stays suppressed");
assert.match(client,/noteForegroundTransition\(\)/);
assert.match(client,/if \(!document.hidden && !isNativeAppShell\(\)\) windowFocused = true/);
assert.match(client,/resumedFromAt: new Date\(sendingResumeMs\)\.toISOString\(\)/);
assert.match(client,/if \(sendingResumeMs && resumeSinceMs === sendingResumeMs\) resumeSinceMs = 0/);
assert.match(server,/lastBackgroundedAt: existing\?\.backgrounded === true/);
assert.match(server,/priorLastForegroundAt: existing\?\.lastForegroundAt/);
assert.match(server,/resumedFromAt,/);
assert.match(server,/writeAnonymousPresenceAndArrival/);
for(let i=0;i<500;i++){
 const t=now+i*61_000;
 const again=isNewAnonymousArrival({
  nowMs:t,
  priorLastForegroundAt:new Date(t-125_000).toISOString(),
  priorLastSeenAt:new Date(t-300).toISOString(),
  priorAnnouncedAt:new Date(t-61_000).toISOString(),
  priorBackgrounded:true,
  priorBackgroundedAt:new Date(t-61_000).toISOString(),
 });
 assert.equal(again,true,"return "+i);
}
console.log("PASS BRAVE ANON REENTRY: 60s/59s, hidden writes, lost background fetch, 90s heartbeat, stale resume, 500 reentries");
