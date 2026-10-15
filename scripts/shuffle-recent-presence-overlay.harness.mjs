import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync("src/lib/shuffle/recentOnlineProfiles.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
const require=(name)=>{
 if(name.includes("dedupeProfiles"))return {
  dedupeShuffleProfiles:(rows)=>[...new Map(rows.map(x=>[x.uid,x])).values()],
  shuffleProfilesShareIdentity:(a,b)=>a.uid===b.uid || !!(a.authUid&&a.authUid===b.authUid),
 };
 return {};
};
vm.runInNewContext(compiled,{exports,require,Set,Map,Boolean,Date});
const merge=exports.mergeRecentOnlineProfiles;
const old=[{uid:"u1",username:"uno",presenceAt:"2026-10-14T15:00:00Z",lastActive:"2026-10-14T15:00:00Z",showOnline:false,photo:"A"},
 {uid:"u2",username:"dos",showOnline:false},
 {uid:"anon_a",username:"Anónimo",shuffleVisitor:true,showOnline:true}];
const fresh=[{uid:"u1",username:"uno",presenceAt:"2026-10-15T04:27:00Z",lastActive:"2026-10-15T04:27:00Z",showOnline:true,photo:"A"},
 {uid:"u3",username:"tres",presenceAt:"2026-10-15T04:28:00Z",lastActive:"2026-10-15T04:28:00Z",showOnline:true}];
const result=merge(old,fresh);
assert.equal(result.length,4,"one identity, one card and newly registered user appended");
assert.equal(result.find(p=>p.uid==="u1").showOnline,true,"stale cached online badge recovered");
assert.equal(result.find(p=>p.uid==="u1").presenceAt,"2026-10-15T04:27:00Z");
assert.equal(result.find(p=>p.uid==="u2").showOnline,false,"other profiles untouched");
assert.equal(result.find(p=>p.uid==="anon_a").showOnline,true,"three-hour visitor green badge unaffected");
assert.equal(result.find(p=>p.uid==="u3").showOnline,true,"new registered profile enters pool");
assert.equal(new Set(result.map(x=>x.uid)).size,4);
const route=fs.readFileSync("src/app/api/shuffle/route.ts","utf8");
assert.match(route,/onlineProfiles: recentRegistered/);
assert.match(route,/!\(profile\.visibilidadPaises\?\.length\)/,"CDN presence slice excludes country-restricted profiles");
assert.match(route,/!\(profile\.visibilidadProvincias\?\.length\)/,"CDN presence slice excludes province-restricted profiles");
console.log("PASS RECENT REGISTERED OVERLAY: cache restoration, new arrivals, unchanged anons, no identity duplication, CDN audience privacy");
