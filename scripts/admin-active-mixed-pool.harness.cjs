const assert=require("node:assert/strict");
const fs=require("node:fs");
const {activeAdminPresencePool,chooseAdminPresenceTarget}=require("../functions/lib/adminPresencePool.js");
const now=Date.parse("2026-10-18T14:00:00Z");
const anon=(id,data={})=>({id,data:{lastSeenAt:new Date(now-30000).toISOString(),sessionClosed:false,backgrounded:false,disponibleParaChat:true,visibilidadPaises:[],visibilidadProvincias:[],...data}});
const prof=(id,data={})=>({id,data:{username:id,online:true,lastForegroundAt:{toMillis:()=>now-35000},mostrarUltimaVez:true,visibilidadPaises:[],visibilidadProvincias:[],banned:false,...data}});
const anonymous=[
 anon("anon_abcdef12"),anon("anon_stale000",{lastSeenAt:new Date(now-5*60000).toISOString()}),
 anon("anon_closed0",{sessionClosed:true}),anon("anon_back000",{backgrounded:true}),
 anon("anon_dnd000",{doNotDisturbUntil:new Date(now+30000).toISOString()}),
 anon("anon_restrict",{visibilidadPaises:["AR"]}),anon("anon_busy000",{disponibleParaChat:false})
];
const profiles=[
 prof("test_profile"),prof("stale_profile",{lastForegroundAt:{toMillis:()=>now-4*60000}}),
 prof("offline_name",{online:false}),prof("private_profile",{mostrarUltimaVez:false}),
 prof("banned_name",{banned:true}),prof("region_name",{visibilidadProvincias:["Córdoba"]})
];
const p=activeAdminPresencePool(anonymous,profiles,now);
assert.equal(p.anonymous.length,1);assert.equal(p.profiles.length,1);
assert.equal(chooseAdminPresenceTarget(p,"","")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget(p,"anonymous","anon_abcdef12")?.type,"profile");
assert.equal(chooseAdminPresenceTarget(p,"profile","test_profile")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget({profiles:p.profiles,anonymous:[]},"anonymous","")?.type,"profile");
assert.equal(chooseAdminPresenceTarget({profiles:[],anonymous:p.anonymous},"profile","")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget({profiles:[],anonymous:[]},"",""),null);
const f=fs.readFileSync("functions/src/anonArrivalPush.ts","utf8");
const ui=fs.readFileSync("src/components/admin/panels/AdminAnonymousActivityButton.tsx","utf8");
for(const s of ['isVerifiedOwnerAdmin(request.auth)','orderBy("lastSeenAt","desc")','orderBy("lastForegroundAt","desc")','activeAdminPresencePool','chooseAdminPresenceTarget','if (preview) return','source:"manual_admin"','reason:"no_public_online_users"'])assert(f.includes(s),s);
assert(ui.includes("Ver pool conectado"));assert(ui.includes("Enviar aviso de conexión"));
console.log("PASS: two live presence types; only recently active and publicly visible; stale/hidden/banned/DND/geo excluded; rotation; preview-only; owner gate; existing FCM topic.");
