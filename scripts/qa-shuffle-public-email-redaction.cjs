const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),zlib=require('node:zlib');
const file=fs.readFileSync('src/app/api/shuffle/route.ts','utf8');
const begin=file.indexOf('function shuffleJson('),end=file.indexOf('\nexport const dynamic',begin);
assert.ok(begin>=0&&end>begin,'Shuffle response function not found');
const js=ts.transpileModule(file.slice(begin,end)+'\nexports.shuffleJson=shuffleJson;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{},Headers,Response,Request,Buffer,brotliCompressSync:zlib.brotliCompressSync,gzipSync:zlib.gzipSync,zlibConstants:zlib.constants,SHUFFLE_JSON_HEADERS:{'Cache-Control':'private, no-store'}};
vm.runInNewContext(js,context);
(async()=>{
const fake={uid:'uid-1',aliasIds:['uid-1','legacy-1'],username:'test',email:'never-expose@example.invalid',bio:'hello',photo:'https://example.invalid/photo'};
const body={ok:true,profiles:[fake],featuredProfiles:[fake],onlineProfiles:[fake],returned:1};
const req=new Request('https://sayittome-app.web.app/api/shuffle');
const response=context.exports.shuffleJson(req,body);
const output=await response.json();
for(const rows of [output.profiles,output.featuredProfiles,output.onlineProfiles]){
 assert.equal(rows.length,1);assert.ok(!Object.hasOwn(rows[0],'email'),'email must not be public');
 assert.equal(rows[0].uid,'uid-1');assert.equal(rows[0].aliasIds.length,2);
}
assert.equal(body.profiles[0].email,'never-expose@example.invalid','must not mutate server cache');
const compressed=context.exports.shuffleJson(new Request(req.url,{headers:{'Accept-Encoding':'br,gzip'}}),{profiles:Array.from({length:657},(_,i)=>({...fake,uid:String(i)}))});
const raw=Buffer.from(await compressed.arrayBuffer());const decoded=zlib.brotliDecompressSync(raw).toString('utf8');
assert.equal(compressed.headers.get('Content-Encoding'),'br');
assert.equal(JSON.parse(decoded).profiles.length,657);assert.ok(!decoded.includes('never-expose@example.invalid'));
const visit=context.exports.shuffleJson(req,body,{publicVisitorSlice:true});
assert.match(visit.headers.get('Cache-Control'),/s-maxage=20/);
console.log('PASS_PUBLIC_SHUFFLE_EMAIL_REDACTION',JSON.stringify({allSlices:true,compressed:true,doesNotMutate:true,identitiesPreserved:true,fullPoolPreserved:true,cdNCachePreserved:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1});