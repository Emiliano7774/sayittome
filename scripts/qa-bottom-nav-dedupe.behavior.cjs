const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {build}=require('esbuild');
const calls={supersedes:0,cancels:0,history:[],paint:0};
let slide=false;
globalThis.window={location:{pathname:'/stories'}};
globalThis.document={documentElement:{dataset:{},classList:{contains:()=>false}},body:{classList:{contains:()=>false}}};
globalThis.__qaNav=calls;
const mod={
'react':'export function useRef(value){return {current:value}}',
'next/link':'export default function Link() {return null}',
'@/lib/app/nativeShell':'export function isNativeAppShell(){return false}',
'@/lib/chat/pendingChatSends':'export function hasPendingChatSends(){return false};export async function waitForPendingChatSends(){}',
'@/lib/navigation/fastNavigate':'export function fastMainTabHistoryPush(to){globalThis.__qaNav.history.push(to);window.location.pathname=to}',
'@/lib/navigation/mainTabKeepAlive':'export function armIncomingBarTab(){};export function markMainTabVisited(){};export function pinMainTabKeepAlive(){}',
'@/lib/navigation/mainTabs':'export function isMainTabHref(v){return ["/stories","/chats","/boost","/settings","/shuffle"].includes(v)}',
'@/lib/navigation/shuffleKeepAlive':'export function beginShuffleWarmHandoff(){};export function pinShuffleKeepAlive(){};export function pinShuffleWindowWhileAway(){}',
'@/lib/navigation/shuffleHandoffState':'export function clearStaleShuffleEntryHandoffForMainTabDestination(){}',
'@/lib/navigation/mainTabToShuffleTransition':'export function abortMainTabToShuffleTransition(){globalThis.__qaNav.cancels++};export function blockMainTabNavigationDuringSlide(){return globalThis.__qaSlide};export function cancelPendingShuffleRouteCommits(){globalThis.__qaNav.supersedes++};export function isInternalMainTabToShuffleTransitionActive(){return globalThis.__qaSlide};export function noteConcreteMainTabSupersede(){}',
'@/lib/navigation/stuckTabSurfaceReconcile':'export function presentNativeBarSectionNow(){globalThis.__qaNav.paint++}',
'@/lib/navigation/tabDestinationReadiness':'export function isTabShellNoLoadingTransitionContractActive(){return false}',
'@/lib/perf/navTrace':'export function isNavTraceEnabled(){return false}',
'@/lib/perf/ghostFrameTrace':'export function ghostFrameWatchBegin(){};export function ghostFrameWatchInspect(){}',
'@/lib/chats/chatsPrepaintHandoff':'export function writeChatsPrepaintHandoffMarker(){}',
'@/lib/chats/chatsHandoffSuppress':'export function armChatsSequenceHandoffSuppress(){}',
'@/lib/boost/boostPrepaintHandoff':'export function writeBoostPrepaintHandoffMarker(){}',
'@/lib/boost/boostHandoffSuppress':'export function armBoostSequenceHandoffSuppress(){}'
};
(async()=>{
 const res=await build({entryPoints:[path.resolve('src/components/navigation/BottomNavLink.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react/jsx-runtime'],
 plugins:[{name:'mock-nav',setup(b){b.onResolve({filter:/^(react$|next\/link$|@\/)/},x=>({path:x.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},x=>{assert.ok(mod[x.path],x.path);return{contents:mod[x.path],loader:'js'}})}}]});
 const mm=new Module(path.join(process.cwd(),'qa-nav-module.cjs'),module);mm.filename=path.join(process.cwd(),'qa-nav-module.cjs');mm.paths=Module._nodeModulePaths(process.cwd());mm._compile(res.outputFiles[0].text,mm.filename);
 const Nav=mm.exports.default;
 function click(el){const e={button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,preventDefault(){this.defaultPrevented=true}};el.props.onClick(e)}
 function reset(){calls.supersedes=0;calls.cancels=0;calls.history.length=0;calls.paint=0;globalThis.__qaSlide=false}
 reset();window.location.pathname='/stories';
 let el=Nav({href:'/chats',children:'Chats'});
 el.props.onPointerDown();click(el);
 assert.deepEqual(calls.history,['/chats'],'one history push');
 assert.equal(calls.supersedes,1,'one supersede on normal pointerdown');
 reset();window.location.pathname='/chats';
 el=Nav({href:'/chats',children:'Chats'});el.props.onPointerDown();click(el);
 assert.equal(calls.history.length,0,'retap must not push history');
 assert.equal(calls.supersedes,0,'retap must not cancel ongoing transitions');
 reset();window.location.pathname='/chats';
 el=Nav({href:'/boost',children:'Boost'});click(el);
 assert.deepEqual(calls.history,['/boost'],'keyboard click commits');
 assert.equal(calls.supersedes,1,'keyboard click cancels only once');
 reset();window.location.pathname='/shuffle';globalThis.__qaSlide=true;
 el=Nav({href:'/stories',children:'Stories'});el.props.onPointerDown();click(el);
 assert.deepEqual(calls.history,['/stories'],'active slide superseded by tab');
 assert.ok(calls.supersedes>=1 && calls.supersedes<=2,'active slide superseded without repeated cancellations');
 console.log('PASS_BOTTOM_NAV_DEDUPE_BEHAVIOR',{ordinarySupersedes:1,retapSupersedes:0,keyboardSupersedes:1,slideDestination:'stories'});
})().catch(e=>{console.error('FAIL_BOTTOM_NAV_DEDUPE',String(e.stack||e));process.exitCode=1});
