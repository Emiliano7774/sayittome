const assert=require("node:assert/strict");
const fs=require("node:fs");
const {activeAdminPresencePool,chooseAdminPresenceTarget,excludeAdministratorRows}=require("../functions/lib/adminPresencePool.js");
const now=Date.parse("2026-10-18T14:00:00Z");
const anon=(id,data={})=>({id,data:{lastSeenAt:new Date(now-30000).toISOString(),sessionClosed:false,backgrounded:false,disponibleParaChat:true,visibilidadPaises:[],visibilidadProvincias:[],...data}});
const prof=(id,data={})=>({id,data:{username:id,online:true,lastActiveAt:{toMillis:()=>now-35000},mostrarUltimaVez:true,visibilidadPaises:[],visibilidadProvincias:[],banned:false,...data}});
const anonymous=[
 anon("anon_abcdef12"),anon("anon_stale000",{lastSeenAt:new Date(now-5*60000).toISOString()}),
 anon("anon_closed0",{sessionClosed:true}),anon("anon_back000",{backgrounded:true}),
 anon("anon_dnd000",{doNotDisturbUntil:new Date(now+30000).toISOString()}),
 anon("anon_restrict",{visibilidadPaises:["AR"]}),anon("anon_busy000",{disponibleParaChat:false})
];
const profiles=[
 prof("test_profile"),prof("recent_online",{online:false,lastActiveAt:{toMillis:()=>now-10*60000}}),
 prof("private_profile",{mostrarUltimaVez:false,lastActiveAt:{toMillis:()=>now-3*60000}}),
 prof("legacy_profile",{lastActiveAt:undefined,lastSeenAt:new Date(now-4*60000).toISOString(),lastForegroundAt:undefined}),
 prof("expired_profile",{lastActiveAt:{toMillis:()=>now-16*60000}}),
 prof("banned_name",{banned:true}),prof("region_name",{visibilidadProvincias:["Cordoba"]})
];
const owner="owner-account-uid",ownerEmail="owner@example.com";
const extraProfiles=[prof(owner,{email:ownerEmail}),prof("another_admin",{rol:"admin"}),prof("email_admin",{correo:ownerEmail})];
const extraAnon=anon("anon_adminid",{authUid:owner});
const selectedProfiles=excludeAdministratorRows([...profiles,...extraProfiles],owner,ownerEmail);
const selectedAnon=excludeAdministratorRows([...anonymous,extraAnon],owner,ownerEmail);
assert.equal(selectedProfiles.length,profiles.length,"owner UID, email, role all excluded");
assert.equal(selectedAnon.length,anonymous.length,"admin anon alias excluded");
const p=activeAdminPresencePool(selectedAnon,selectedProfiles,now);
assert.equal(p.anonymous.length,1);assert.equal(p.profiles.length,4,"Shuffle 15m including legacy, hidden-lastseen and online=false recent");
assert.deepEqual(p.profiles.map(x=>x.username).sort(),["legacy_profile","private_profile","recent_online","test_profile"]);
assert.equal(chooseAdminPresenceTarget(p,"","")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget(p,"anonymous","anon_abcdef12")?.type,"profile");
assert.equal(chooseAdminPresenceTarget(p,"profile","test_profile")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget({profiles:p.profiles,anonymous:[]},"anonymous","")?.type,"profile");
assert.equal(chooseAdminPresenceTarget({profiles:[],anonymous:p.anonymous},"profile","")?.type,"anonymous");
assert.equal(chooseAdminPresenceTarget({profiles:[],anonymous:[]},"",""),null);
const fn=fs.readFileSync("functions/src/anonArrivalPush.ts","utf8");
const ui=fs.readFileSync("src/components/admin/panels/AdminAnonymousActivityButton.tsx","utf8");
for(const s of ['isVerifiedOwnerAdmin(request.auth)','orderBy("lastSeenAt","desc")','orderBy("lastActiveAt","desc")','activeAdminPresencePool','chooseAdminPresenceTarget','if (preview) return','source:"manual_admin"','reason:"no_public_online_users"'])assert(fn.includes(s),s);
assert(ui.includes("Ver pool conectado"));
console.log("PASS: Shuffle-equivalent 15-minute registered pool, hidden lastseen included, old data fields, offline flag not authoritative, banned and geo excluded, anon live, alternating, owner gate");
