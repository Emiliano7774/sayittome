const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const base=process.env.SITM_QA_BASE||'http://127.0.0.1:3029';
const config=fs.readFileSync('src/lib/monetization/monetagConfig.ts','utf8');
assert.match(config,/MONETAG_VIGNETTE_WEB_ENABLED\s*=\s*false/);
assert.match(config,/MONETAG_PUSH_TAG_WEB_ENABLED\s*=\s*false/);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
  const ctx=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true});
  const p=await ctx.newPage(),thirdParty=[],errors=[];
  p.on('request',r=>{try{const h=new URL(r.url()).hostname;if(['5gvci.com','n6wxm.com'].includes(h))thirdParty.push(h)}catch{}});
  p.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
  const res=await p.goto(base+'/shuffle',{waitUntil:'domcontentloaded',timeout:50000});
  assert.ok(res?.ok(),'shuffle page must respond 200');
  await p.waitForTimeout(1700);
  const state=await p.evaluate(async()=>{
    const iframeSelector='html > iframe',frames=()=>[...document.querySelectorAll(iframeSelector)];
    const overlayCount=()=>frames().filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.position==='fixed'&&Number(s.zIndex)>1e9&&r.width>innerWidth*.8&&r.height>innerHeight*.8}).length;
    const before=overlayCount();
    const fake=document.createElement('iframe');
    fake.src=location.href;
    fake.style.cssText='position:fixed!important;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:auto';
    document.documentElement.appendChild(fake);
    await new Promise(resolve=>setTimeout(resolve,250));
    const after=document.documentElement.contains(fake);
    const legitimate=document.createElement('iframe');
    legitimate.src='about:blank';
    legitimate.style.cssText='position:absolute;left:-200px;top:-200px;width:1px;height:1px';
    document.body.appendChild(legitimate);
    await new Promise(resolve=>setTimeout(resolve,110));
    const preserved=document.body.contains(legitimate);
    legitimate.remove();if(after)fake.remove();
    return{before,syntheticStillBlocking:after,legitimatePreserved:preserved,afterCleanup:overlayCount(),activeNavTabs:document.querySelectorAll('[data-nav-tab]').length,
      thirdPartyScripts:[...document.scripts].filter(x=>/5gvci\.com|n6wxm\.com/.test(x.src)).length};
  });
  assert.equal(state.before,0,'initial fullscreen frame');
  assert.equal(state.syntheticStillBlocking,false,'iframe touch shield failed to remove injected overlay');
  assert.equal(state.legitimatePreserved,true,'shield removed legitimate offscreen frame');
  assert.equal(state.afterCleanup,0,'fullscreen frame still present');
  assert.equal(state.thirdPartyScripts,0,'Monetag overlay script still rendered');
  const tabs=[];
  for(const name of ['chats','stories','settings','boost','shuffle']){
   const t=await p.evaluate(async name=>{
     const e=document.querySelector('[data-nav-tab="'+name+'"]');if(!e)return {name,available:false};
     e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,button:0}));
     e.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const host=name==='shuffle'?document.getElementById('sayittome-shuffle-keepalive-host'):document.getElementById('sayittome-main-tab-keepalive-'+name);
     return {name,active:host?.classList.contains(name==='shuffle'?'sayittome-shuffle-keepalive-visible':'sayittome-main-tab-keepalive-visible')||false};
   },name);tabs.push(t);await p.waitForTimeout(230);
  }
  await p.waitForTimeout(700);
  const last=await p.evaluate(()=>({scripts:[...document.scripts].filter(x=>/5gvci\.com|n6wxm\.com/.test(x.src)).length,
    frames:[...document.documentElement.children].filter(x=>x.tagName==='IFRAME'&&Number(getComputedStyle(x).zIndex)>1e9).length}));
  assert.deepEqual(thirdParty,[],'external popunder/push scripts fetched');
  assert.equal(last.scripts,0);assert.equal(last.frames,0);
  console.log('QA_NAV_VALUES',JSON.stringify(tabs));
  assert.ok(tabs.every(x=>x.active),'navigation regression');
  console.log('PASS_NO_TOUCH_BLOCKING_WEB_ADS',JSON.stringify({state,tabs,last,thirdParty,errors}));
  await ctx.close();
 }finally{await browser.close()}
})().catch(e=>{console.error('FAIL_NO_TOUCH_BLOCKING_WEB_ADS',String(e.stack||e).slice(0,900));process.exitCode=1});
