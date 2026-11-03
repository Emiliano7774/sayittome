const assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module');
const {build}=require('esbuild');
const stubs={
'@/lib/navigation/mainTabToShuffleTransition':'export function isMainTabToShufflePresentationOwned(){return false}',
'@/lib/navigation/tabHandoffDestinationGuard':'export function canClearShuffleExitLatch(){return true}',
'@/lib/chats/chatsPrepaintHandoff':'export function writeChatsPrepaintHandoffMarker(){}',
'@/lib/chats/chatsHandoffSuppress':'export function armChatsSequenceHandoffSuppress(){}',
'@/lib/boost/boostPrepaintHandoff':'export function writeBoostPrepaintHandoffMarker(){}',
'@/lib/boost/boostHandoffSuppress':'export function armBoostSequenceHandoffSuppress(){}',
'@/lib/navigation/mainTabKeepAlive':'export function markMainTabVisited(){}',
};
const classSet=new Set(),attrs=new Set();
globalThis.document={documentElement:{
 classList:{contains:name=>classSet.has(name),add:name=>classSet.add(name),remove:name=>classSet.delete(name)},
 hasAttribute:name=>attrs.has(name),
 setAttribute:name=>attrs.add(name),
 removeAttribute:name=>attrs.delete(name)
}};
(async()=>{
 const r=await build({entryPoints:[path.resolve('src/lib/navigation/shuffleHandoffState.ts')],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock-deps',setup(b){
   b.onResolve({filter:/^@\//},x=>({path:x.path,namespace:'stub'}));
   b.onLoad({filter:/.*/,namespace:'stub'},x=>{assert(stubs[x.path],'Unmocked '+x.path);return{contents:stubs[x.path],loader:'js'}});
 }}]});
 const m=new Module(path.resolve('qa-idempotent-clear.cjs'),module);m.filename=path.resolve('qa-idempotent-clear.cjs');m.paths=Module._nodeModulePaths(process.cwd());m._compile(r.outputFiles[0].text,m.filename);
 let delivered=0;const unsubscribe=m.exports.subscribeShuffleHandoffState(()=>delivered++);
 const version=m.exports.getShuffleHandoffVersion;
 for(let i=0;i<360;i++)assert.equal(m.exports.clearStaleShuffleEntryHandoffForMainTabDestination('/stories'),false);
 assert.equal(delivered,0,'idle watchdog cannot trigger 360 React notifications');
 assert.equal(version(),0);
 classSet.add('sayittome-shuffle-handoff-pending');attrs.add('data-shuffle-defer-source');
 assert.equal(m.exports.clearStaleShuffleEntryHandoffForMainTabDestination('/stories'),true);
 assert.equal(classSet.size,0);assert.equal(attrs.size,0);
 assert.equal(delivered,1);
 for(let i=0;i<360;i++)assert.equal(m.exports.clearStaleShuffleEntryHandoffForMainTabDestination('/stories'),false);
 assert.equal(delivered,1);
 m.exports.beginShuffleRevealDeferred('/stories');
 assert.equal(delivered,2);
 assert.equal(m.exports.clearStaleShuffleEntryHandoffForMainTabDestination('/stories'),true);
 assert.equal(delivered,3);
 assert.equal(m.exports.isShuffleRevealDeferred(),false);
 assert.equal(m.exports.clearStaleShuffleEntryHandoffForMainTabDestination('/shuffle'),false);
 unsubscribe();
 console.log('PASS_STORIES_WATCHDOG_IDEMPOTENT_NOTIFICATIONS',JSON.stringify({idle360Notifications:0,realStateChanges:3,watchdogNoop:720}));
})().catch(e=>{console.error('FAIL_STORIES_WATCHDOG_IDEMPOTENCY',String(e.stack||e));process.exitCode=1});
