const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'src/lib/shuffle/sharedPublicPoolCache.ts'),'utf8');
const js=ts.transpileModule(original,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const events={get:0,txn:0,lease:0,set:0,scan:0};
let data={},getError=false,readDelay=0,txDelay=0;
const ref={
 async get(){events.get++;if(getError)throw Error('simulated fast read outage');if(readDelay)await new Promise(r=>setTimeout(r,readDelay));return{data:()=>({...data})}},
 async set(patch,opts){events.set++;data={...data,...patch}},
 firestore:{async runTransaction(action){events.txn++;if(txDelay)await new Promise(r=>setTimeout(r,txDelay));const tx={
 async get(){return{data:()=>({...data})}},
 set(ref,patch,opts){events.lease++;data={...data,...patch}}
 };return action(tx)}}
};
const db={collection(name){assert.equal(name,'system');return{doc(id){assert.ok(id.includes('shuffle'));return ref}}}};
const customRequire=spec=>spec.includes('historicalAuthorshipRepairAdmin')?{getRepairAdminDb:()=>db}:require(spec);
const mod={exports:{}};new Function('module','exports','require',js)(mod,mod.exports,customRequire);
const cache=mod.exports,fixture=[{uid:'qa-1',username:'one',pais:'AR'},{uid:'qa-2',username:'two',pais:'US'}];
function reset(next,getFails=false){for(const k in events)events[k]=0;data={...next};getError=getFails;readDelay=0;txDelay=0}
function stats(){return{...events}}
const scan=async()=>{events.scan++;return fixture};
(async()=>{
 const t=Date.now();
 const fresh={payload:cache.packSharedPool(fixture),refreshedAtMs:t-1000,leaseUntilMs:0,format:'gzip-base64-v1'};
 reset(fresh);
 const a=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true});
 assert.deepEqual(a.items,fixture);assert.deepEqual(stats(),{get:1,txn:0,lease:0,set:0,scan:0});
 console.log('CASE_FRESH_FAST',JSON.stringify(stats()));
 reset(fresh);
 const b=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:false});
 assert.deepEqual(b.items,fixture);assert.deepEqual(stats(),{get:0,txn:1,lease:0,set:0,scan:0});
 console.log('CASE_BASELINE_TRANSACTION',JSON.stringify(stats()));
 reset({...fresh,refreshedAtMs:t-9*60_000,leaseUntilMs:t+20000});
 const c=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true});
 assert.deepEqual(c.items,fixture);assert.deepEqual(stats(),{get:1,txn:1,lease:0,set:0,scan:0});
 console.log('CASE_STALE_LEASE_WAIT',JSON.stringify(stats()));
 reset({...fresh,refreshedAtMs:t-20*60_000,leaseUntilMs:0});
 const d=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true});
 assert.deepEqual(d.items,fixture);assert.deepEqual(stats(),{get:1,txn:1,lease:1,set:1,scan:1});
 console.log('CASE_EXPIRED_REBUILD',JSON.stringify(stats()));
 reset(fresh,true);
 const e=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true});
 assert.deepEqual(e.items,fixture);assert.deepEqual(stats(),{get:1,txn:1,lease:0,set:0,scan:0});
 console.log('CASE_FAST_READ_FAILURE_FALLBACK',JSON.stringify(stats()));
 reset({...fresh,payload:cache.packSharedPool([])});
 const f=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true,allowEmpty:true,ttlMs:15000});
 assert.deepEqual(f.items,[]);assert.deepEqual(stats(),{get:1,txn:0,lease:0,set:0,scan:0});
 console.log('CASE_EMPTY_VISITORS_ALLOWED',JSON.stringify(stats()));
 reset(fresh);
 const g=await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:false,allowEmpty:true,ttlMs:15000});
 assert.deepEqual(g.items,fixture);assert.deepEqual(stats(),{get:0,txn:1,lease:0,set:0,scan:0});
 console.log('CASE_VISITOR_ORIGINAL_PATH',JSON.stringify(stats()));
 // Mocked RPC A/B: no production Firestore reads or writes.
 reset(fresh);readDelay=25;txDelay=140;let start=performance.now();
 await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:false});
 const baseline=performance.now()-start;
 reset(fresh);readDelay=25;txDelay=140;start=performance.now();
 await cache.readOrBuildSharedPublicPool(scan,{preferDirectRead:true});
 const fast=performance.now()-start;
 assert.ok(fast<baseline*.5,'Fast read must materially reduce modeled cold-hit latency');
 console.log('PASS_SHARED_FASTGET_MOCK',JSON.stringify({pass:true,baselineMs:+baseline.toFixed(1),fastMs:+fast.toFixed(1),modelOnly:true,realFirebaseUsed:false}));
})().catch(e=>{console.error('FAIL_SHARED_FASTGET_MOCK',e.stack);process.exitCode=1});