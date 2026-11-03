const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const source=fs.readFileSync('src/components/navigation/MainTabKeepAliveHost.tsx','utf8');
const from=source.indexOf('let storiesEntryHandoffScrubToken = 0;');
const to=source.indexOf('function resolveMainTabPanelPath(',from);
assert(from>0&&to>from);
const js=transformSync(source.slice(from,to),{loader:'ts',format:'esm'}).code;
const timers=new Map(),intervals=new Map(),listeners=new Map(),observers=[],subs=new Set();let id=1,time=0,rafCalls=0,clears=0,slide=false,deferred=false;
const htmlClass=new Set(),htmlAttributes=new Set();
const document={hidden:false,documentElement:{
 classList:{contains:x=>htmlClass.has(x),add:x=>htmlClass.add(x),remove:x=>htmlClass.delete(x)},
 hasAttribute:x=>htmlAttributes.has(x),setAttribute:x=>htmlAttributes.add(x),removeAttribute:x=>htmlAttributes.delete(x)
},addEventListener(n,cb){listeners.set(n,cb)},removeEventListener(n,cb){if(listeners.get(n)===cb)listeners.delete(n)}};
const browser={location:{pathname:'/stories'},setTimeout(fn,delay){const key=id++;timers.set(key,{fn,delay});return key},clearTimeout(key){timers.delete(key)},setInterval(fn,delay){const key=id++;intervals.set(key,{fn,delay});return key},clearInterval(key){intervals.delete(key)}};
class MutationObserver{constructor(cb){this.cb=cb;this.connected=false;observers.push(this)}observe(){this.connected=true}disconnect(){this.connected=false}}
const ctx={window:browser,document,MutationObserver,performance:{now:()=>time},requestAnimationFrame:()=>{rafCalls++},
 isInternalMainTabToShuffleTransitionActive:()=>slide,isShuffleRevealDeferred:()=>deferred,getShuffleDeferSourcePath:()=>'/stories',
 subscribeShuffleHandoffState:cb=>{subs.add(cb);return()=>subs.delete(cb)},
 clearStaleShuffleEntryHandoffForMainTabDestination:()=>{if(htmlClass.has('sayittome-shuffle-handoff-pending')||htmlAttributes.has('data-shuffle-defer-source')||deferred){clears++;htmlClass.delete('sayittome-shuffle-handoff-pending');htmlAttributes.delete('data-shuffle-defer-source');deferred=false}}};
vm.runInNewContext(js+'\n;this.arm=armStoriesEntryHandoffScrub;',ctx);
ctx.arm();assert.equal(rafCalls,0,'no unconditional 360 animation-frame loop');
assert.equal(intervals.size,1);assert.equal(timers.size,1);assert.equal(subs.size,1);
htmlClass.add('sayittome-shuffle-handoff-pending');for(const o of observers)if(o.connected)o.cb();
assert.equal(clears,1,'class change immediately repairs stale CSS');
slide=true;htmlClass.add('sayittome-shuffle-handoff-pending');for(const o of observers)if(o.connected)o.cb();assert.equal(clears,1,'active micro-slide remains protected');
slide=false;for(const cb of subs)cb();assert.equal(clears,2,'state event repairs after slide');
document.hidden=true;time=2300;listeners.get('visibilitychange')();
assert.equal(intervals.size,0,'hidden tab does not keep polling');
assert.equal(timers.size,0,'hidden tab pauses deadline');
document.hidden=false;time=2340;listeners.get('visibilitychange')();
assert.equal(intervals.size,1);assert.equal(timers.size,1);
browser.location.pathname='/boost';for(const o of observers)if(o.connected)o.cb();
assert.equal(intervals.size,0,'leaving Stories removes fallback polling');
assert.equal(subs.size,0,'leaving Stories releases subscriptions');
browser.location.pathname='/stories';ctx.arm();
assert.equal(subs.size,1);assert.equal(intervals.size,1);
const deadline=[...timers.values()][0];deadline.fn();
assert.equal(intervals.size,0,'six-second watchdog expires');assert.equal(subs.size,0,'expiration releases observer');
console.log('PASS_STORIES_EVENT_SCRUB_BEHAVIOR',JSON.stringify({rafCalls,realRepairs:clears,restoredBackground:true,cancelsOnRouteExit:true,timeoutCleanup:true}));
