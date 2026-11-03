const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {build}=require('esbuild');
(async()=>{
  const root=process.cwd(), hooks=[], pending=[], cache=new Map();
  let cursor=0,dirty=false,requests=0;
  globalThis.__qaAuth={firebaseUser:{uid:'qa-user'}};
  globalThis.__qaBoostEnabled=true;
  globalThis.__qaBoostCache=cache;
  const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  globalThis.__qaReact={
    useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={kind:'state',value:initial};return[hooks[i].value,next=>{if(!Object.is(hooks[i].value,next)){hooks[i].value=next;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!hooks[i])hooks[i]={kind:'ref',value:{current:initial}};return hooks[i].value},
    useCallback(fn,deps){const i=cursor++;if(!hooks[i]||!same(hooks[i].deps,deps))hooks[i]={kind:'cb',value:fn,deps};return hooks[i].value},
    useEffect(fn,deps){const i=cursor++;if(!hooks[i]||!same(hooks[i].deps,deps)){const old=hooks[i];hooks[i]={kind:'effect',deps,cleanup:null};pending.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn()})}},
  };
  const stub={
    'react':'export const useState=globalThis.__qaReact.useState;export const useRef=globalThis.__qaReact.useRef;export const useCallback=globalThis.__qaReact.useCallback;export const useEffect=globalThis.__qaReact.useEffect;',
    '@/contexts/AuthContext':'export function useAuth(){return globalThis.__qaAuth}',
    '@/hooks/useBoostEligibility':'export function useBoostEligibility(){return {canUseBoost:globalThis.__qaBoostEnabled}}',
    '@/lib/boost/boostEligibility':'export function boostCacheKey(uid){return "boost:"+uid}',
    '@/lib/cache/clientCache':'export function readClientCache(key){return globalThis.__qaBoostCache.get(key)||null};export function writeClientCache(key,value){globalThis.__qaBoostCache.set(key,value)}'
  };
  const res=await build({entryPoints:[path.join(root,'src/hooks/useBoostStatus.ts')],bundle:true,platform:'node',format:'cjs',write:false,
   plugins:[{name:'boost-hook-mocks',setup(api){api.onResolve({filter:/^(react|@\/)/},x=>({path:x.path,namespace:'mock'}));api.onLoad({filter:/.*/,namespace:'mock'},x=>{assert(x.path in stub,'Unexpected import '+x.path);return{contents:stub[x.path],loader:'js'}})}}]});
  const mod=new Module(path.join(root,'qa-boost-hook.cjs'),module);mod.filename=path.join(root,'qa-boost-hook.cjs');mod.paths=Module._nodeModulePaths(root);mod._compile(res.outputFiles[0].text,mod.filename);
  const hook=mod.exports.useBoostStatus;
  globalThis.fetch=async()=>{requests++;return{json:async()=>({ok:true,boostCreditsMinutes:15,activeBoostUntil:null,referralCode:'qa',referralLink:'https://example.test',referralsQualified:0,referralsPending:0})}};
  async function render(enabled){let value;for(let i=0;i<12;i++){dirty=false;cursor=0;value=hook(enabled);const tasks=pending.splice(0);for(const run of tasks)run();await new Promise(resolve=>setTimeout(resolve,0));if(!dirty)return value;}throw Error('Hook rendering did not stabilize')}
  let v=await render(false);
  assert.equal(requests,0,'hidden Boost must not fetch');
  assert.equal(v.status,null);
  v=await render(true);
  assert.equal(requests,1,'foreground Boost fetch exactly once');
  assert.equal(v.status?.boostCreditsMinutes,15);
  v=await render(false);
  assert.equal(v.status?.boostCreditsMinutes,15,'hidden Boost retains cached status');
  assert.equal(requests,1,'hide must not refetch');
  v=await render(true);
  assert.equal(requests,1,'return to Boost reuses fresh data without network');
  assert.equal(v.status?.boostCreditsMinutes,15);
  globalThis.__qaBoostEnabled=false;
  v=await render(false);
  assert.equal(v.status,null,'revoked eligibility clears status');
  console.log('PASS_BOOST_KEEPALIVE_FETCH_GATING',JSON.stringify({hiddenRequests:0,foregroundRequests:1,returnRequests:1,preservedStatus:true,eligibilityRevocationClears:true}));
})().catch(e=>{console.error('FAIL_BOOST_KEEPALIVE_FETCH_GATING',String(e.stack||e));process.exitCode=1});
