const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/hooks/useAdminSession.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let authSubscribeCount=0,authUnsubscribeCount=0,authCallback=()=>{},notificationCount=0;
const mounts=[];
const env={
 exports:{},
 window:{},
 require:id=>{
   if(id==='react')return {useSyncExternalStore:(subscribe,getSnapshot,getServerSnapshot)=>{
     const cleanup=subscribe(()=>notificationCount++);
     const mount={cleanup,getSnapshot,getServerSnapshot};mounts.push(mount);return getSnapshot();
   }};
   if(id==='firebase/auth')return {onAuthStateChanged:(auth,callback,error)=>{
     assert.equal(auth,'AUTH');authSubscribeCount++;authCallback=callback;
     return()=>{authUnsubscribeCount++};
   }};
   if(id==='@/lib/firebase')return {auth:'AUTH'};
   if(id==='@/lib/admin/isAdmin')return {isAdminEmail:email=>email==='admin@example.org'};
   throw Error('Unexpected dependency '+id);
 },console
};
vm.runInNewContext(js,env);
for(let i=0;i<140;i++)env.exports.useAdminSession();
assert.equal(authSubscribeCount,1,'140 mounted controls must share ONE Firebase Auth subscription');
assert.equal(mounts[0].getSnapshot().ready,false);
authCallback({email:'admin@example.org'});
assert.equal(mounts[139].getSnapshot().isAdmin,true);
assert.equal(mounts[139].getSnapshot().ready,true);
assert.equal(notificationCount,140,'all subscribers refresh on auth changes');
authCallback(null);
assert.equal(mounts[0].getSnapshot().isAdmin,false);
assert.equal(mounts[0].getSnapshot().ready,true);
for(const mount of mounts)mount.cleanup();
assert.equal(authUnsubscribeCount,1,'underlying listener stops when all controls unmount');
assert.equal(mounts[0].getSnapshot().ready,false,'stale admin identity must not remain in memory');
env.exports.useAdminSession();
assert.equal(authSubscribeCount,2,'remount reattaches exactly one new Firebase listener');
mounts[mounts.length-1].cleanup();
console.log('PASS_SHARED_ADMIN_AUTH',JSON.stringify({controls:140,firebaseListenersAtOnce:1,authUpdates:2,unsubscriptions:authUnsubscribeCount,staleIdentityCleared:true}));