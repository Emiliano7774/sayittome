const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript"),assert=require("node:assert/strict");
function read(path){return fs.readFileSync(path,"utf8")}
function moduleFromTs(path,imports={}){const e={};const source=ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(source,{exports:e,require:(path)=>imports[path]||{},Date,Number,String,Math});return e}
const p=moduleFromTs("src/lib/anonMatch/anonymousPresenceIdentity.ts");
const now=Date.parse("2026-10-09T12:00:00Z");const duration=10800000;
assert.equal(p.ANON_SHUFFLE_VISIBILITY_MS,duration);
for(const delay of [0,1000,3*60*1000,15*60*1000,60*60*1000,duration]){
  assert.equal(p.anonShuffleVisible(now-delay,now),true,"visible through "+delay);
}
assert.equal(p.anonShuffleVisible(now-duration-1,now),false);
assert.equal(p.anonShuffleVisible(now+31000,now),false);
const f=moduleFromTs("src/lib/shuffle/shuffleVisitorFresh.ts",{"@/lib/anonMatch/anonymousPresenceIdentity":p});
assert.equal(f.isShuffleVisitorFresh({shuffleVisitor:true,presenceAt:new Date(now-duration).toISOString()},now),true);
assert.equal(f.isShuffleVisitorFresh({shuffleVisitor:true,presenceAt:new Date(now-duration-1).toISOString()},now),false);
assert.equal(f.isShuffleVisitorFresh({shuffleVisitor:false,presenceAt:"bad"},now),true);
const shuffle=read("src/app/api/shuffle/route.ts");
assert.match(shuffle,/minLastSeenAt: new Date\(now - ANON_SHUFFLE_VISIBILITY_MS\)\.toISOString\(\)/);
assert.match(shuffle,/anonShuffleVisible\(seenMs, now\)/);
assert.match(shuffle,/showOnline: true/);
const route=read("src/app/api/anonymous-presence/route.ts");
assert.match(route,/expiresAt = new Date\(now\.getTime\(\) \+ ANON_SHUFFLE_VISIBILITY_MS\)/);
assert.match(route,/sessionClosed: false/);
assert.match(route,/async function endAnonymousPresenceSession/);
assert.match(route,/sessionClosed: true/);
assert.match(route,/disponibleParaChat: false/);
assert.match(route,/await endAnonymousPresenceSession\(anonId\)/);
assert.match(route,/lastSeenAt: now\.toISOString\(\)/);
const match=read("src/lib/anonMatch/matchPool.ts");
assert.match(match,/if \(row\.sessionClosed === true\) return false/);
assert.match(match,/ANON_MATCH_PRESENCE_FRESH_MS/);
const client=read("src/services/anonymousPresence.ts");
assert.match(client,/beforeunload/);assert.match(client,/method: "DELETE"/);
const auth=read("src/lib/auth/authPersistence.ts");
assert.match(auth,/browserSessionPersistence/);
console.log("PASS ANON SHUFFLE 3H: inclusive 3h visibility, exactly after expiry hidden, visitor badge, presence lease independent, explicit closed sessions uncontactable, automatic random match still short-lived, tab-local anonymous auth.");
