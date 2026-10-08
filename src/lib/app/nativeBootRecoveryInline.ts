/**
 * Runs in <head> before React. Native WebViews can otherwise remain black when
 * cached HTML references a previous deployment's Next chunks or a transient
 * navigation handoff leaves every paint surface hidden.
 */
export const NATIVE_BOOT_RECOVERY_SCRIPT = `(function(){try{
var ua=navigator.userAgent||"";
var cap=window.Capacitor;
var nativeLike=!!(cap&&typeof cap.isNativePlatform==="function"&&cap.isNativePlatform())||/SayItToMeApp|;\\s*wv\\)|\\bwv\\b/i.test(ua);
if(!nativeLike)return;
var KEY="sayittome:native-boot-recovery";
var WINDOW_MS=60000,MAX=2;
function readState(){try{var x=JSON.parse(sessionStorage.getItem(KEY)||"null");if(!x||typeof x.t!=="number"||Date.now()-x.t>WINDOW_MS)return{t:Date.now(),n:0};return x;}catch(e){return{t:Date.now(),n:0};}}
function clearTransient(){
 try{
  var h=document.documentElement;
  ["sayittome-shuffle-exit-handoff-pending","sayittome-main-tab-handoff-pending","sayittome-shuffle-handoff-pending","sayittome-shuffle-return-pending"].forEach(function(c){h.classList.remove(c);});
  ["data-sayittome-shuffle-reveal-from","data-sayittome-shuffle-reveal-pending","data-shuffle-exit-handoff-target","data-sayittome-main-tab-handoff-source","data-prepaint-chats-handoff-suppress","data-prepaint-boost-handoff-suppress","data-chats-handoff-suppress","data-boost-handoff-suppress","data-tab-post-auth-settle","data-chats-post-auth-settle","data-boost-post-commit-settle"].forEach(function(a){h.removeAttribute(a);});
  ["sayittome:chats-prepaint-handoff","sayittome:chats-sequence-handoff-suppress-until","sayittome:chats-sequence-handoff-suppress-tx","sayittome:boost-prepaint-handoff","sayittome:boost-sequence-handoff-suppress-until","sayittome:boost-sequence-handoff-suppress-tx"].forEach(function(k){try{sessionStorage.removeItem(k);}catch(e){}});
  var s=document.querySelector(".sayittome-route-shell");
  if(s){s.removeAttribute("hidden");s.removeAttribute("aria-hidden");s.removeAttribute("data-sayittome-nonmain-released-for-shuffle");s.style.visibility="visible";s.style.opacity="1";s.style.pointerEvents="";}
 }catch(e){}
}
function recover(reason){
 var st=readState();if(st.n>=MAX)return;
 st.n+=1;st.t=Date.now();try{sessionStorage.setItem(KEY,JSON.stringify(st));}catch(e){}
 clearTransient();
 try{
  var u=new URL(location.href);u.searchParams.set("_native_recover",String(Date.now()));u.searchParams.set("_native_reason",String(reason||"boot").slice(0,24));location.replace(u.toString());
 }catch(e){location.reload();}
}
function chunkish(v){return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to load module script|\\/_next\\/static\\//i.test(String(v||""));}
window.addEventListener("error",function(e){var t=e&&e.target;var src=t&&(t.src||t.href)||"";if(chunkish(src)||chunkish(e&&e.message))recover("chunk");},true);
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;var m=typeof r==="string"?r:(r&&r.message)||"";if(chunkish(m))recover("promise");},true);
function visible(el){if(!el)return false;try{var cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)>0.01&&r.width>1&&r.height>1;}catch(e){return false;}}
function hasVisibleAppContent(){
 try{
  var nodes=[
   document.querySelector(".sayittome-route-shell"),
   document.getElementById("sayittome-shuffle-keepalive-host"),
   document.querySelector('[id^="sayittome-main-tab-keepalive-"]'),
   document.querySelector("main"),
   document.querySelector('[data-sayittome-chat-composer]'),
   document.querySelector('[data-nav-tab]'),
   document.querySelector("form"),
   document.querySelector("article"),
   document.querySelector("section")
  ];
  if(nodes.some(visible))return true;
  var body=document.body;
  if(!body||!visible(body))return false;
  var text=String(body.innerText||"").replace(/\s+/g," ").trim();
  if(text.length<12)return false;
  var interactive=body.querySelectorAll("input,textarea,button,a,[role=button]");
  for(var i=0;i<interactive.length;i++){if(visible(interactive[i]))return true;}
 }catch(e){}
 return false;
}
setTimeout(function(){
 if(!hasVisibleAppContent()){recover("black");return;}
 try{sessionStorage.removeItem(KEY);}catch(e){}
},4500);
}catch(e){}})();`;
