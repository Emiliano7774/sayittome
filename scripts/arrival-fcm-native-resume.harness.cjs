const assert = require("node:assert/strict");
const fs=require("node:fs"), ts=require("typescript");
const store=new Map();
let session=new Map();
global.window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)}};
const receiptSource=fs.readFileSync("src/lib/anonMatch/arrivalToastReceipt.ts","utf8");
const receiptCode=ts.transpileModule(receiptSource,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function newReceipts(){const m={exports:{}};new Function("module","exports",receiptCode)(m,m.exports);return m.exports;}
const src=fs.readFileSync("src/lib/chat/fcmPush.ts","utf8");
const start=src.indexOf("const ARRIVAL_LOCAL_CHANNEL ="),end=src.indexOf("async function attachPushListeners()",start);
assert(start>=0&&end>start);
const transpiled=ts.transpileModule(src.slice(start,end)
  .replace('await import("@capacitor/local-notifications")','await Promise.resolve({LocalNotifications:TestLocalNotifications})'),
  {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
let now=Date.now(),visible="visible";
const realNow=Date.now;Date.now=()=>now;
const scheduled=[];
const TestLocalNotifications={
 checkPermissions:async()=>({display:"granted"}),
 createChannel:async()=>{},
 schedule:async({notifications})=>scheduled.push(...notifications)
};
const auth={currentUser:{uid:"viewer"}};
const asId=x=>String(x||"").trim();
function newListener(){
 const consume=newReceipts().consumeForegroundConnectionNoticeOnce;
 return new Function("getAnonArrivalPushPreference","auth","document","asId","TestLocalNotifications",
   "consumeForegroundConnectionNoticeOnce",transpiled+"; return showNativeForegroundArrival;")(
   ()=>true,auth,{get visibilityState(){return visible;}},asId,TestLocalNotifications,consume);
}
(async()=>{
 let show=newListener();
 const data={type:"profile_arrival",username:"person1",tag:"stm-arrival-person1",title:"Online",body:"Entrada"};
 await Promise.all(Array.from({length:8},()=>show(data)));
 assert.equal(scheduled.length,1,"8 simultaneous callbacks must display once");
 const firstId=scheduled[0].id;
 session=new Map();
 global.window.sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)};
 show=newListener();
 now+=5000;await show(data);
 assert.equal(scheduled.length,1,"foreground profile replay after WebView remount");
 now+=60_000;await show({...data,tag:"different-tag"});
 assert.equal(scheduled.length,1,"same person with changed FCM message tag");
 visible="hidden";await show({...data,username:"hiddenperson"});
 assert.equal(scheduled.length,1,"background should not duplicate OS push");
 visible="visible";
 await show({...data,username:"other"});
 assert.equal(scheduled.length,2,"another person must notify");
 await show({type:"anon_arrival",anonId:"anon_test12345"});
 assert.equal(scheduled.length,2,"anonymous in-app toast owns foreground notifications");
 now+=15*60_000+1;
 await show(data);
 assert.equal(scheduled.length,3,"new legitimate arrival after 15min can notify");
 assert.equal(scheduled[2].id,firstId,"same person must keep stable Android notification ID");
 console.log("PASS_NATIVE_ARRIVAL_REPLAY: concurrent callbacks, WebView recreation, repeated FCM tag, background race, different user, anon isolated, legitimate return after 15min");
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow;});
