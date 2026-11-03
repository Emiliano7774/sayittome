const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function load(js,req,globals={}){const exports={};vm.runInNewContext(js,{exports,require:req,console,URL,...globals});return exports;}
const helper=load(transpile('src/lib/media/profileThumbnail.ts'),()=>{throw Error('unexpected import')});
const requests=[];class ImageMock{constructor(){this.fetchPriority='auto';this.onerror=null;this.decoding='auto'}set src(value){requests.push({value,priority:this.fetchPriority,image:this})}get src(){return requests.at(-1)?.value||''}}
const warm=load(transpile('src/lib/shuffle/warmImages.ts'),spec=>spec==='@/lib/media/profileThumbnail'?helper:{},{Image:ImageMock,window:{},setTimeout:f=>{f();return 1}});
const photo=i=>'https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/usuarios%2Ffake-'+i+'%2Ffotos%2Favatar.jpg?alt=media&token='+'A'.repeat(25);
const source=Array.from({length:35},(_,i)=>({uid:'uid_'+i,photo:photo(i)}));
warm.warmShuffleImages(source,6,{urgent:true});
assert.equal(requests.length,6);
for(let i=0;i<6;i++){const r=requests[i];const u=new URL(r.value,'https://sayittome-app.web.app');assert.equal(u.pathname,'/api/profile-thumbnail','full original was prefetched');assert.equal(u.searchParams.get('w'),'256');assert.ok(u.searchParams.get('u').startsWith('https://firebasestorage.googleapis.com/'));assert.equal(r.priority,i<4?'high':'low');}
warm.warmShuffleImages(source,6,{urgent:true});
assert.equal(requests.length,6,'duplicate speculative prefetch');
warm.clearShuffleImageWarmCache();
const originalCount=requests.length;
warm.warmShuffleImages([{uid:'private',photo:'https://evil.example/secret.jpg'},source[0],{uid:'private2',photo:'https://firebasestorage.googleapis.com/v0/b/other/o/private?alt=media&token=abcdef'}],6,{urgent:true});
assert.equal(requests.length-originalCount,1,'ineligible private URL must never be fetched speculatively');
requests.at(-1).image.onerror();
warm.warmShuffleImages([source[0]],6,{urgent:true});
assert.equal(requests.length-originalCount,2,'failed prefetch should be retryable');
const hook=fs.readFileSync('src/hooks/useShufflePool.ts','utf8');
assert.equal((hook.match(/warmShuffleImages\(/g)||[]).length,1,'full-pool warming still exists');
assert.match(hook,/warmShuffleImages\(shownProfiles,\s*6,\s*\{ urgent: forceReplace \}\)/,'selected-card warming missing');
console.log('PASS_SHUFFLE_THUMBNAIL_WARMUP',{selected:6,highPriority:4,lowPriority:2,fullStorageOriginalPrefetches:0,duplicates:0,privateSourcePrefetches:0,unselectedPoolWarmCalls:0,retryAfterFailure:true});
