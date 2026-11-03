const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const cp=require('node:child_process');
const current=fs.readFileSync('src/lib/chat/whipSound.ts','utf8');
// Compare against the old multi-listener baseline, not today's HEAD.
const original=cp.execFileSync('git',['show','e34ab8a^:src/lib/chat/whipSound.ts'],{encoding:'utf8'});
function run(source,settles=false,fakeClock=null){
 const listeners=new Map(),docListeners=new Map();let plays=0,created=0;
 const add=(m,t,h)=>{if(!m.has(t))m.set(t,new Set());m.get(t).add(h)};
 const remove=(m,t,h)=>m.get(t)?.delete(h);
 const window={PointerEvent:function(){},addEventListener:(t,h)=>add(listeners,t,h),removeEventListener:(t,h)=>remove(listeners,t,h)};
 const document={hidden:false,addEventListener:(t,h)=>add(docListeners,t,h),removeEventListener:(t,h)=>remove(docListeners,t,h)};
 class Audio {constructor(src){assert.equal(src,'/sounds/whip.mp3');created++;this.muted=false;this.preload='';this.currentTime=0;this.volume=1}
 play(){plays++;return settles?Promise.resolve():new Promise(()=>{})}
 pause(){}}
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,window,document,Audio,console,Date:fakeClock?{now:()=>fakeClock.value}:Date,setTimeout,clearTimeout,require:(name)=>{
 if(name==='@/lib/app/nativeShell')return {isCapacitorNative:()=>false};
 if(name==='@/lib/chat/chatNotificationPrefs')return {areChatNotificationsEnabled:()=>false};
 throw Error('Unexpected module '+name);
 }});
 const off=[exports.bindWhipSoundUnlock(),exports.bindWhipSoundUnlock(),exports.bindWhipSoundUnlock()];
 const count=m=>[...m.values()].reduce((n,x)=>n+x.size,0);
 const initially={window:count(listeners),document:count(docListeners)};
 const trigger=t=>{for(const h of listeners.get(t)||[])h()};
 trigger('pointerdown');trigger('touchstart');trigger('click');
 const afterTap={plays,created};
 off.forEach(f=>f());off[0]();
 const afterCleanup={window:count(listeners),document:count(docListeners)};
 return {initially,afterTap,afterCleanup,exports,trigger,getPlays:()=>plays};
}
const baseline=run(original),candidate=run(current);
assert.equal(baseline.initially.window,15,'3 subscribers x 5 events baseline');
assert.equal(baseline.initially.document,3,'3 leak baseline');
assert.equal(baseline.afterTap.plays,9,'3 events x 3 listeners baseline');
assert.equal(baseline.afterCleanup.document,3,'baseline visibility leak');
assert.deepEqual(candidate.initially,{window:3,document:1});
assert.equal(candidate.afterTap.plays,1,'only one audio play from one physical touch while pending');
assert.deepEqual(candidate.afterCleanup,{window:0,document:0});
(async()=>{
const fast=run(current,true);
assert.equal(fast.afterTap.plays,1);
await Promise.resolve();await Promise.resolve();await Promise.resolve();
assert.equal(fast.exports.playIncomingWhipSound(),true,'incoming whip still plays');
const clock={value:1000};
const stalled=run(current,false,clock);
assert.equal(stalled.getPlays(),1);
clock.value+=4500;
stalled.exports.unlockWhipSound();
assert.equal(stalled.getPlays(),2,'stalled Android play must retry after 4 seconds');
console.log('PASS_WHIP_GLOBAL_POINTER_COALESCE',JSON.stringify({baseline:{listeners:baseline.initially,audioPlaysPerTouch:baseline.afterTap.plays,visibilityLeak:baseline.afterCleanup.document},candidate:{listeners:candidate.initially,audioPlaysPerTouch:candidate.afterTap.plays,cleanup:candidate.afterCleanup,incomingWhipPreserved:true},reductionPct:Math.round(100*(1-candidate.afterTap.plays/baseline.afterTap.plays))}));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});