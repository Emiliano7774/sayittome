const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const ctx=await browser.newContext({viewport:{width:393,height:852}});
 const p=await ctx.newPage();
 await p.goto('https://sayittome-app.web.app/shuffle',{waitUntil:'domcontentloaded',timeout:55000});
 await p.waitForTimeout(4100);
 const list=await p.evaluate(()=>Array.from(document.images).map(x=>x.src).filter(x=>x.startsWith('https://firebasestorage.googleapis.com/v0/b/')&&x.includes('/o/usuarios')).slice(0,6));
 if(!list.length)throw Error('NO_PROFILE_STORAGE_SOURCE_IN_LIVE_POOL');
 const base='http://127.0.0.1:3027/api/profile-thumbnail';
 const probes=[{label:'avatar',w:96,url:list[0]},{label:'row',w:256,url:list[0]},{label:'hero',w:960,url:list[0]},{label:'different',w:640,url:list[1]||list[0]}];
 for(const probe of probes){
   const started=Date.now();
   const response=await ctx.request.get(base+'?u='+encodeURIComponent(probe.url)+'&w='+probe.w,{timeout:25000});
   const body=await response.body();
   console.log('THUMBNAIL_REAL_QA',JSON.stringify({label:probe.label,status:response.status(),contentType:response.headers()['content-type'],srcBytes:response.headers()['x-photo-source-bytes'],bytes:body.length,ms:Date.now()-started,cacheControl:response.headers()['cache-control'],signal:response.headers()['server-timing']||'',errorBody:body.length<100?body.toString('utf8'):undefined}));
   if(response.status()!==200||response.headers()['content-type']!=='image/webp'||body.length>500000)throw Error('INVALID_OPTIMIZER '+probe.label);
 }
 const invalid=[
 {label:'badOrigin',url:'https://evil.example/usuarios/abcdef/fotos/photo.jpg?alt=media&token=abcdef000000000000000000',w:960},
 {label:'wrongBucket',url:'https://firebasestorage.googleapis.com/v0/b/different.appspot.com/o/usuarios%2Fabc%2Ffotos%2Fx.jpg?alt=media&token=abcdef000000000000000000',w:960},
 {label:'privateFolder',url:'https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/chats%2Fprivate%2Fphoto.jpg?alt=media&token=abcdef000000000000000000',w:960},
 {label:'tokenMissing',url:'https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/usuarios%2Fabc%2Ffotos%2Fx.jpg?alt=media',w:960},
 {label:'widthInvalid',url:list[0],w:9999}
 ];
 for(const probe of invalid){const response=await ctx.request.get(base+'?u='+encodeURIComponent(probe.url)+'&w='+probe.w,{timeout:11000});console.log('THUMBNAIL_SECURITY_QA',JSON.stringify({label:probe.label,status:response.status()}));if(response.status()!==400)throw Error('ALLOWLIST_BYPASS '+probe.label)}
 await ctx.close();
 }finally{await browser.close()}
})().catch(e=>{console.error('FAIL_THUMBNAIL_REAL_QA',String(e.stack||e).slice(0,800));process.exitCode=1});
