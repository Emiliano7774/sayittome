import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
function loadTs(relative, injections="") {
  let code=fs.readFileSync(path.join(root, relative), "utf8");
  code=code.replace(/import\s+(?:type\s+)?(?:\{[\s\S]*?\}|[\w]+)\s+from\s+["'][^"']+["'];?/g, "");
  code=injections+"\n"+code;
  const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function("module","exports",js)(mod,mod.exports);
  return mod.exports;
}
const fair = loadTs("src/lib/shuffle/shuffleFairCycle.ts", `
const shuffleFiltersFingerprint = (filters, search) => JSON.stringify({...filters,search,intereses:[...(filters.intereses||[])].sort()});
const shuffleProfileBatchExcludeKeys = (p) => [...new Set([p.uid,p.authUid,p.firebaseUid,...(p.aliasIds||[])].filter(Boolean).map(id => "id:"+id))];
`);
const mix=loadTs("src/lib/shuffle/shuffleRecencyMix.ts");
const filters=(extra={})=>({
 verPaises:[], verProvincias:[], aparecerPaises:[], aparecerProvincias:[],
 sexo:"todos",ciudad:"",edadMin:0,edadMax:0,soloOnline:false,soloConFoto:false,
 soloConHistorias:false,intereses:[],...extra
});
const profile = (i,anon=false)=>({
 uid: (anon?"anon_":"reg_")+String(i).padStart(4,"0"),
 authUid: (anon?"auth_anon_":"auth_reg_")+i, aliasIds:[],
 username:anon?"Anónimo":"Persona"+i,shuffleVisitor:anon,
 presenceAt:new Date().toISOString(),lastActive:new Date().toISOString()
});
const shuffledPage=(pool, seen)=>{
 const next=fair.nextUnseenShufflePool(pool, seen);
 const page=mix.mixShuffleWindow(next.pool,{now:Date.now(),windowSize:35,strictExclude:true});
 const uid=new Set(page.map(r=>r.uid));
 assert.equal(uid.size,page.length, "duplicate within window");
 fair.markShuffleFairWindow(page,seen);
 return {page, restarted:next.restarted};
};
function cover(name,pool,scope){
 const seen=fair.shuffleFairSeen(scope);
 seen.clear();
 const shown=new Set();
 let pages=0;
 const sizes=[];
 while(shown.size < pool.length && pages < 50) {
   const {page,restarted}=shuffledPage(pool,seen);
   assert.equal(restarted,false);
   assert.ok(page.length>0&&page.length<=35);
   for(const p of page) {
     assert.ok(!shown.has(p.uid),name+" repeats before exhaustion: "+p.uid);
     shown.add(p.uid);
   }
   sizes.push(page.length);
   pages++;
 }
 assert.equal(shown.size,pool.length,name+" missed eligible users");
 const restart=shuffledPage(pool,seen);
 assert.equal(restart.restarted,true,name+" did not restart after exhaustion");
 assert.equal(restart.page.length,Math.min(35,pool.length));
 console.log("PASS",name,"pool="+pool.length,"pages="+sizes.join("+"),"next-cycle="+restart.page.length);
}
for(const n of [1,2,20,35,36,37,70,95,120,350,1000]) {
 const rows=Array.from({length:n},(_,i)=>profile(i,i%3===0));
 cover("default_"+n,rows,"default-"+n);
}
cover("solo_conectados_82",Array.from({length:82},(_,i)=>profile(i,i%2===0)),"soloOnline");
cover("only_anonymous_79",Array.from({length:79},(_,i)=>profile(i,true)),"anon79");
cover("only_registered_83",Array.from({length:83},(_,i)=>profile(i,false)),"registered83");
const all=Array.from({length:140},(_,i)=>({...profile(i,i%4===0), pais:i%2?"AR":"ES",sexo:i%3?"hombre":"mujer"}));
for(const [name,list,options] of [
 ["solo_online",all.filter(p=>p.shuffleVisitor),{soloOnline:true}],
 ["gender_female",all.filter(p=>p.sexo==="mujer"),{sexo:"mujer"}],
 ["argentina",all.filter(p=>p.pais==="AR"),{verPaises:["AR"]}],
 ["joined_filters",all.filter(p=>p.pais==="AR"&&p.sexo==="mujer"),{verPaises:["AR"],sexo:"mujer"}],
]) {
 const scope=fair.shuffleFairCycleScope(filters(options));
 cover(name,list,scope);
}
// Each filtered combination tracks independent seen state.
const fA=fair.shuffleFairCycleScope(filters({soloOnline:true}));
const fB=fair.shuffleFairCycleScope(filters({sexo:"mujer"}));
assert.notEqual(fA,fB);
assert.notEqual(fair.shuffleFairSeen(fA),fair.shuffleFairSeen(fB));
console.log("PASS filter cycles isolated");
// Newcomers are eligible; already shown offscreen must not reenter on presence polls.
const original=Array.from({length:70},(_,i)=>profile(i,true));
const seen=new Set();
const first=shuffledPage(original,seen).page;
const newVisitor=profile(999,true);
const eligible=fair.filterShuffleFairLiveVisitors([...original,newVisitor], first,seen);
assert.ok(eligible.some(p=>p.uid===newVisitor.uid));
assert.ok(first.every(p=>eligible.includes(p)));
assert.ok(eligible.every(p=>!seen.has("id:"+p.uid)||first.some(v=>v.uid===p.uid)));
console.log("PASS presence newcomers and unseen without resurrecting prior windows");
// pool churn: originally 36, last 1 disconnects, new cycle may restart.
const churn=Array.from({length:36},(_,i)=>profile(i,false));
const seenChurn=new Set();
const firstChurn=shuffledPage(churn,seenChurn).page;
const leftover=churn.find(p=>!firstChurn.some(v=>v.uid===p.uid));
assert.ok(leftover);
assert.equal(fair.nextUnseenShufflePool(churn.filter(p=>p.uid!==leftover.uid),seenChurn).restarted,true);
console.log("PASS disconnected members do not block cycle restart");
console.log("PASS all filtered Shuffle fair-cycle coverage checks");
