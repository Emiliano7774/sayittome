import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "../src/lib/presence.ts";
const path="src/lib/shuffle/serverFilters.ts";
const source=fs.readFileSync(path,"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
const require=(name)=>{
 if(name.includes("lastSeenVisibility")) return {isPublicShuffleOnline:(profile,calculate)=>profile.mostrarUltimaVez!==false&&calculate(profile)};
 if(name==="@/lib/presence") return {isShuffleProfileOnline,ONLINE_WINDOW_MS};
 if(name.includes("geo/audience")) return {geoAudienceIncludes:()=>true};
 if(name.includes("shuffle/filters")) return {shuffleFiltersHasAny:(filters)=>filters.soloOnline===true,discoveryAudience:()=>({})};
 return {};
};
vm.runInNewContext(compiled,{exports,require,Date,Set,Number,String});
const matches=exports.profileMatchesShuffleServerFilters;
const now=Date.parse("2026-10-15T04:00:00Z");
const base={shuffleVisitor:true,mostrarUltimaVez:true,photo:"",lastActive:""};
const online={soloOnline:true,soloConFoto:false,soloConHistorias:false,sexo:"todos",ciudad:"",edadMin:0,edadMax:0,intereses:[]};
const all={...online,soloOnline:false};
for(const minutes of [0,1,14,15]){
 const p={...base,presenceAt:new Date(now-minutes*60000).toISOString()};
 assert.equal(matches(p,online,now),true,"recent anon must be Solo online "+minutes);
}
const stale={...base,presenceAt:new Date(now-15*60000-1).toISOString()};
assert.equal(matches(stale,online,now),false,"stale anon must leave Solo online");
assert.equal(matches(stale,all,now),true,"three-hour anonymous general discovery remains unchanged");
assert.equal(matches({...base,presenceAt:""},online,now),false,"missing heartbeat cannot be online");
assert.equal(matches({...base,presenceAt:new Date(now-12*60000).toISOString()}, {...online,soloConFoto:true},now),false,"photo filter preserved");
const registered={shuffleVisitor:false,mostrarUltimaVez:true,presenceAt:new Date(now-14*60000).toISOString()};
assert.equal(matches(registered,online,now),true,"recent registered profile");
assert.equal(matches({...registered,presenceAt:new Date(now-17*60000).toISOString()},online,now),false,"stale registered profile");
assert.equal(matches({...registered,mostrarUltimaVez:false},online,now),false,"hidden last seen privacy");
assert.match(source,/if \(filters\.soloOnline\) return isShuffleProfileOnline\(profile, now, ONLINE_WINDOW_MS\)/);
console.log("PASS SOLO-ONLINE WINDOW: 11 real filter scenarios; 15-minute registered + anonymous cutoff, privacy and general Shuffle unchanged");
