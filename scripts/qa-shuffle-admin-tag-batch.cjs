const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {execFileSync}=require('node:child_process');
const path='src/lib/shuffle/shuffleAdminTagOverlay.ts';
const source=fs.readFileSync(path,'utf8');
const previous=execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'});
function run(text) {
  let stored=null;
  const writes=[];
  const cache={
    readClientCache(){return stored},
    writeClientCache(k,value){
      stored=JSON.parse(JSON.stringify(value));
      writes.push({key:k,size:JSON.stringify(value).length});
    }
  };
  const exports={};
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:s=>s==='@/lib/cache/clientCache'?cache:undefined,window:{},console});
  return {api:exports,writes,read:()=>stored};
}
const data=Array.from({length:660},(_,i)=>({uid:'uid_'+i,...(i%12===0?{moderationTag:'roleplay'}:{}),...(i%37===0?{fakeProfileTag:'fake'}:{}),...(i%49===0?{groomingTag:true}:{})}));
const before=run(previous),after=run(source);
const startPrevious=performance.now();
for(const profile of data)before.api.reconcileShuffleAdminTagOverlayFromServer(profile);
const elapsedPrevious=performance.now()-startPrevious;
const startCandidate=performance.now();
after.api.reconcileShuffleAdminTagOverlaysFromServer(data);
const elapsedCandidate=performance.now()-startCandidate;
assert.deepEqual(after.read(),before.read(),'persisted admin safety labels changed');
assert.ok(before.writes.length>50,'baseline did not reproduce repeated writes');
assert.equal(after.writes.length,1,'batch normalization must persist exactly once');
const applied=after.api.applyShuffleAdminTagOverlays(data);
for(const idx of [0,12,37,49,100,333]){
  const orig=before.api.applyShuffleAdminTagOverlay(data[idx]);
  const next=applied[idx];
  assert.equal(next.fakeProfileTag,orig.fakeProfileTag,'fake tag drift');
  assert.equal(next.moderationTag,orig.moderationTag,'roleplay tag drift');
  assert.equal(next.groomingTag,orig.groomingTag,'grooming tag drift');
  assert.equal(next.potentialPedophileTag,orig.potentialPedophileTag,'potential tag drift');
}
const oldWrites=after.writes.length;
after.api.reconcileShuffleAdminTagOverlaysFromServer([{uid:'uid_0',moderationTag:''}]);
assert.equal(after.writes.length,oldWrites,'unchanged/unmarked batch wrote storage');
assert.equal(after.api.applyShuffleAdminTagOverlay({uid:'uid_0'}).fakeProfileTag,'fake','stale miss cleared sticky safety label');
after.api.setShuffleAdminTagOverlay('explicit-action',{potentialPedophileTag:true});
assert.equal(after.writes.length,oldWrites+1,'explicit moderation setter must synchronously persist');
assert.equal(after.read()['explicit-action'].potentialPedophileTag,true,'explicit action not saved');
console.log('PASS_SHUFFLE_ADMIN_TAG_BATCH',{profiles:data.length,oldWrites:before.writes.length,newWrites:1,previousMs:+elapsedPrevious.toFixed(2),candidateMs:+elapsedCandidate.toFixed(2),sameStoredTags:true,explicitModerationImmediate:true});
