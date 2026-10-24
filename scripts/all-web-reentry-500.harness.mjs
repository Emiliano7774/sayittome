import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const cache = new Map();
globalThis.sessionStorage = {
  getItem(k) { return cache.get(k) ?? null; },
  setItem(k,v) { cache.set(k, String(v)); },
  removeItem(k) { cache.delete(k); },
};
const load=async p=>import(pathToFileURL(resolve(p)).href);
const clock=await load("src/lib/anonMatch/browserAwayClock.ts");
const anon=await load("src/lib/anonMatch/anonArrival.ts");
const profile=await load("functions/src/profileArrivalPolicy.ts");
const baseline=Date.parse("2026-10-24T15:00:00.000Z");
const iso=x=>new Date(x).toISOString();
for(let i=1;i<=500;i++){
  const priorPush = baseline + (i-1)*121_000;
  const awayAt = priorPush+60_000;
  const returnAt = awayAt+61_000;
  clock.markBrowserAway("anon","anon_test", awayAt);
  clock.markBrowserAway("anon","anon_test", awayAt+8_000);
  clock.markBrowserAway("profile","profile_test", awayAt);
  assert.equal(clock.browserAwaySince("anon","anon_test",awayAt+59_000),0,"no <60s return "+i);
  assert.equal(clock.browserAwaySince("anon","anon_test",returnAt),awayAt,"original anon blur kept "+i);
  assert.equal(clock.browserAwaySince("profile","profile_test",returnAt),awayAt,"original profile blur kept "+i);
  assert.equal(anon.isNewAnonymousArrival({
    nowMs:returnAt, priorLastSeenAt:iso(returnAt-10_000),
    priorAnnouncedAt:iso(priorPush), priorBackgrounded:false,
    clientAwaySinceMs:awayAt,
  }),true,"anon latest heartbeat falsely fresh must NOT block true return "+i);
  assert.equal(profile.mayAnnounceRegisteredReturn({
    nowMs:returnAt,lastForegroundMs:returnAt-10_000,
    lastAnnouncementMs:priorPush,clientAwaySinceMs:awayAt,
  }),true,"profile lastForeground late must NOT block true return "+i);
  assert.equal(anon.isNewAnonymousArrival({
    nowMs:returnAt,priorLastSeenAt:iso(returnAt-10_000),
    priorAnnouncedAt:iso(returnAt-30_000),clientAwaySinceMs:awayAt,
  }),false,"server anon 60s anti-repeat "+i);
  assert.equal(profile.mayAnnounceRegisteredReturn({
    nowMs:returnAt,lastForegroundMs:returnAt-10_000,
    lastAnnouncementMs:returnAt-30_000,clientAwaySinceMs:awayAt,
  }),false,"server profile 60s anti-repeat "+i);
  clock.clearBrowserAway("anon","anon_test");
  clock.clearBrowserAway("profile","profile_test");
  assert.equal(clock.browserAwaySince("anon","anon_test",returnAt+120_000),0,"anon must not replay stale exit");
}
for(const kind of ["anon","profile"]){
  for(let i=1;i<=60;i++){
    const awayAt=baseline+i*1000;
    clock.markBrowserAway(kind,"short_"+i,awayAt);
    assert.equal(clock.browserAwaySince(kind,"short_"+i,awayAt+59_999),0);
    clock.clearBrowserAway(kind,"short_"+i);
  }
}
assert.equal(anon.isNewAnonymousArrival({
  nowMs:baseline+90_000,priorLastSeenAt:iso(baseline),
  priorAnnouncedAt:iso(baseline),priorBackgrounded:false,
}),false,"no phantom 90s foreground heartbeat");
console.log("PASS 500 registered+anonymous real 61s returns; original away clock survives double blur; 60 short returns; no false 90s beat; server dedupe across repeated entries");
