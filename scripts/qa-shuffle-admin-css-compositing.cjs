const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='src/components/profile/';
const source=(name)=>fs.readFileSync(base+name,'utf8');
const role=source('AdminProfileRoleplayButton.tsx');
const fake=source('AdminProfileFakeButton.tsx');
const safety=source('AdminProfileSafetyTagButtons.tsx');
const blur=source('AdminProfileBlurPhotosButton.tsx');
for(const [name,body] of [['roleplay',role],['fake',fake]]){
 const shuffle=body.match(/const shuffleShellClass = \[([\s\S]*?)\]\.join/);
 const profile=body.match(/const profileShellClass = \[([\s\S]*?)\]\.join/);
 assert.ok(shuffle, name+' shuffle shell exists');
 assert.ok(profile, name+' profile shell exists');
 assert.ok(!shuffle[1].includes('backdrop-blur-sm'),name+' shuffle has no compositing blur');
 assert.ok(profile[1].includes('backdrop-blur-sm'),name+' regular profile remains unchanged');
 assert.ok(body.includes('if (isShuffle)'),name+' remains admin-specific');
}
assert.match(safety,/const base = shuffle\s*\?\s*"flex h-8 w-8[^"]*"/);
const shuffleSafety=safety.match(/const base = shuffle\s*\?\s*"([^"]*)"/)?.[1]||'';
assert.ok(!shuffleSafety.includes('backdrop-blur')&&!shuffleSafety.includes('shadow-lg'),'safety controls avoid costly effect');
assert.ok(blur.includes('appearance === "shuffle" ? "" : "backdrop-blur-sm"'),'photo modal button keeps profile styling');
assert.ok(!blur.match(/const shellClass = \[\s*"[^"]*backdrop-blur/),'shuffle class does not apply blur eagerly');
console.log('PASS_SHUFFLE_ADMIN_GPU_EFFECTS',JSON.stringify({profileStylingPreserved:true,moderationButtonsRetained:true,shuffleBackdropFiltersRemoved:5}));
