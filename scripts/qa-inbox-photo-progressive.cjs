const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/hooks/useInboxProfilePhotos.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const deferred=new Map();let cleanup=()=>{};const state=[];let nextState=0;let stateChanges=0;
const react={
 useMemo:fn=>fn(),useEffect:fn=>{cleanup=fn()||(()=>{})},
 useState:initial=>{const n=nextState++;state[n]=typeof initial==='function'?initial():initial;return [state[n],v=>{const updated=typeof v==='function'?v(state[n]):v;if(updated!==state[n]){state[n]=updated;stateChanges++}}]}
};
function defer(name){return new Promise(resolve=>deferred.set(name,resolve))}
const mocks={
 react,
 '@/contexts/MainTabShellContext':{useEffectivePathname:()=>'/chats'},
 '@/hooks/useChatsInbox':{chatTitle:x=>x.username,resolveChatUsername:x=>x.username},
 '@/lib/profile/resolveProfilePhoto':{resolveProfilePhoto:x=>x.photo||''},
 '@/lib/anonMatch/anonDirectInboxBridge':{isAnonDirectInboxChat:x=>x.isAnon===true},
 '@/lib/chat/resolveProfileChat':{fetchProfileByUsername:defer},
 '@/lib/profile/profileCache':{getCachedProfile:()=>null,setCachedProfile:()=>undefined},
 '@/lib/moderation/blur':{profilePhotoRequiresBlur:()=>false}
};
const env={exports:{},require:id=>{if(!mocks[id])throw Error('Unmocked import '+id);return mocks[id]},window:{location:{pathname:'/chats'},setTimeout,clearTimeout},setTimeout,clearTimeout,console};
vm.runInNewContext(js,env);
const rows=[{username:'cached',targetPhoto:'cached.jpg'},{username:'slow',targetPhoto:''},{username:'fast',targetPhoto:''},{username:'anonymous',isAnon:true}];
(async()=>{
 env.exports.useInboxProfilePhotos(rows);
 assert.equal(state[0].cached,'cached.jpg','cached chat photo should render immediately');
 await new Promise(r=>setTimeout(r,12));
 assert.equal(deferred.size,2,'only two uncached public profiles fetched');
 deferred.get('fast')({photo:'fast.jpg'});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(state[0].fast,'fast.jpg','first completed avatar must appear before slow request');
 assert.equal(state[0].slow,undefined,'slow fetch is still pending');
 deferred.get('slow')({photo:'slow.jpg'});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(state[0].slow,'slow.jpg','later avatar must also appear');
 assert.equal(deferred.has('anonymous'),false,'anonymous private chats never trigger public lookup');
 cleanup();
 console.log('PASS_INBOX_PHOTOS_PROGRESSIVE',JSON.stringify({cachedInstant:true,fastBeforeSlow:true,requests:deferred.size,stateChanges}));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});