const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd(),server=path.join(root,'.next','server');
let hashed=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.js')||e.name.endsWith('.json')){if(/profile-image-codec-[0-9a-f]{8,}/.test(fs.readFileSync(p,'utf8')))hashed.push(path.relative(root,p))}}}
assert.ok(fs.existsSync(server),'missing compiled SSR server');
walk(server);
assert.deepEqual(hashed,[],'Turbopack must not generate non-installable hashed codec alias');
const route=fs.readFileSync('src/app/api/profile-thumbnail/route.ts','utf8');
const native=fs.readFileSync('src/lib/media/profileImageCodecNative.ts','utf8');
assert.match(route,/loadProfileImageCodec\(\)/);
assert.doesNotMatch(route,/import\s+sharp\s+from\s+["']profile-image-codec/);
assert.match(native,/createRequire/);
assert.match(native,/\["profile", "image", "codec"\]\.join\("-"\)/);
console.log('PASS_PROFILE_IMAGE_CODEC_NO_HASHED_SSR_IMPORT');
