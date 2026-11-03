const assert=require('node:assert/strict');
const sharp=require('sharp');
const {version}=require('next/package.json');
const fs=require('node:fs');const path=require('node:path');
const {version:sharpVersion}=JSON.parse(fs.readFileSync(path.join(process.cwd(),'node_modules/sharp/package.json'),'utf8'));
(async()=>{
 assert.equal(version,'16.4.1');
 assert.equal(sharpVersion,'0.35.5');
 const source=Buffer.alloc(640*480*3,80);
 const out=await sharp(source,{raw:{width:640,height:480,channels:3}}).resize({width:128}).webp({quality:75}).toBuffer();
 const info=await sharp(out).metadata();
 assert.equal(info.width,128);assert.equal(info.height,96);assert.equal(info.format,'webp');
 console.log('PASS_SECURITY_DEPENDENCY_NATIVE',{next:version,sharp:sharpVersion,sharpVips:sharp.versions.vips,resultBytes:out.length,resizeCorrect:true});
})().catch(e=>{console.error('FAIL_SECURITY_DEPENDENCY_NATIVE',String(e.stack||e));process.exitCode=1});
