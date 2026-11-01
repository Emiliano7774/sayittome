const { chromium, devices } = require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const base=process.env.SHUFFLE_E2E_URL || 'https://sayittome-app.web.app/shuffle';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const blocked of [false,true]){
  const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:393,height:852}});
  const page=await context.newPage();
  const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  assert(response&&response.ok(),'Shuffle route unavailable: '+response?.status());
  await page.waitForTimeout(3500);
  const fixture=await page.evaluate((blocked)=>{
   document.body.classList.remove('sayittome-entry-legal-open');
   document.body.classList.add('sayittome-native-shell');
   document.documentElement.classList.add('sayittome-native-shell');
   document.querySelectorAll('[role="dialog"],[data-entry-legal-overlay],.sayittome-entry-legal-overlay').forEach(e=>e.remove());
   const host=document.querySelector('#sayittome-shuffle-keepalive-host');
   if(!host)throw Error('No keep-alive host');
   host.classList.add('sayittome-shuffle-keepalive-visible');
   host.classList.remove('sayittome-shuffle-keepalive-frozen');
   const root=host.querySelector('main[data-scroll-root]');
   if(!root)throw Error('No scroll root');
   root.style.overflowY='auto';root.style.scrollBehavior='auto';
   let list=root.querySelector('[data-shuffle-list]');
   if(!list){list=document.createElement('div');list.dataset.shuffleList='1';root.appendChild(list)}
   const target=document.createElement('a');target.href='/u/stress';target.textContent='One finger 80 swipe regression';target.style.cssText='display:block;width:100%;height:90000px;background:#222;';
   list.insertBefore(target,list.firstChild);
   if(blocked){root.style.touchAction='none';list.style.touchAction='none'}
   root.scrollTop=19000;
   return {rootTouch:getComputedStyle(root).touchAction,listTouch:getComputedStyle(list).touchAction,initial:root.scrollTop,max:root.scrollHeight-root.clientHeight,mode:host.dataset.shuffleTouchFallbackStatus};
  },blocked);
  assert(fixture.max>25000,'Test fixture failed to create scrollable feed');
  assert.equal(fixture.mode,'installed','Native one finger fallback not installed');
  const cdp=await context.newCDPSession(page);
  const position=()=>page.evaluate(()=>document.querySelector('#sayittome-shuffle-keepalive-host main[data-scroll-root]').scrollTop);
  const swipe=async(dir,k)=>{
   const start=dir==='UP'?690:310;const end=dir==='UP'?310:690;
   const before=await position();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:start,id:1}]});
   for(let n=1;n<=12;n++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y:Math.round(start+(end-start)*n/12),id:1}]});
    await page.waitForTimeout(22);
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForTimeout(155);
   const after=await position();const signed=(after-before)*(dir==='UP'?1:-1);
   if(signed<100)throw Error(`Gesture #${k} ${dir} mode=${blocked?'fallback':'native'} FAILED before=${before} after=${after} diff=${signed}`);
   return {before,after,delta:signed};
  };
  let min=Infinity,max=-Infinity,sum=0;
  for(let k=0;k<40;k++){
   const dir=(k%20)<10?'UP':'DOWN';
   const o=await swipe(dir,k+1);
   min=Math.min(min,o.delta);max=Math.max(max,o.delta);sum+=o.delta;
   if((k+1)%10===0)console.log('PROGRESS',blocked?'FALLBACK':'NATIVE',k+1,'min',Math.round(min),'max',Math.round(max));
  }
  results.push({blocked,fixture,gestures:40,minDelta:min,maxDelta:max,meanDelta:Math.round(sum/40),lastScroll:await position()});
  await context.close();
 }
 console.log('PASS_80_GESTURES_WITH_ZERO_REPRODUCED_STALLS',JSON.stringify(results));
}finally{await browser.close()}
})().catch(e=>{console.error('FAIL_80_GESTURES',e.stack||e);process.exitCode=1});