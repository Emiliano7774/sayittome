const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await b.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
 const started=Date.now(),network=[],errors=[];
 page.on('response',r=>{try{const u=new URL(r.url());if(u.pathname==='/api/profile-thumbnail'&&network.length<30)network.push({status:r.status(),bytes:+(r.headers()['content-length']||0),ms:Date.now()-started,type:r.headers()['content-type']||''})}catch{}});
 page.on('console',m=>{if(m.type()==='error'&&errors.length<10)errors.push(m.text().slice(0,120))});
 await page.goto('http://localhost:3027/shuffle',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(9000);
 const state=await page.evaluate(()=>({cards:document.querySelectorAll('[data-shuffle-card]').length,thumbs:document.querySelectorAll('img[data-profile-thumbnail]').length,ok:[...document.querySelectorAll('img[data-profile-thumbnail]')].filter(i=>i.complete&&i.naturalWidth>0).length,broken:[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).length,loading:[...document.querySelectorAll('img[data-profile-thumbnail]')].filter(i=>!i.complete).length,heading:document.body.innerText.slice(0,65)}));
 console.log('THUMBNAIL_SHUFFLE_UI',JSON.stringify({state,responses:network.length,fast:network.filter(x=>x.status===200).length,fail:network.filter(x=>x.status!==200).length,first:network.slice(0,5),errors:errors.slice(0,4)}));
 if(state.cards<20||state.thumbs<5||state.ok<3||network.filter(x=>x.status===200).length<3)throw Error('FAIL_REAL_UI_THUMBNAIL_LOAD');
 }finally{await b.close()}
})().catch(e=>{console.error('THUMBNAIL_SHUFFLE_UI_FAIL',String(e.stack||e).slice(0,850));process.exitCode=1});
