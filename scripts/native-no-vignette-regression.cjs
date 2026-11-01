// Regression: intrusive Monetag vignette must never load in native WebView
// or while Shuffle is mounted, even after the old 20s activation delay.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const base = process.env.SITM_QA_BASE || 'http://127.0.0.1:3133';
  const browser = await chromium.launch({headless:true});
  try {
    const tests = [
      {name:'android-webview-shuffle', route:'/shuffle', ua:'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 SayItToMeApp', expectVignette:false},
      {name:'android-webview-boost', route:'/boost', ua:'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 SayItToMeApp', expectVignette:false},
      {name:'android-browser-shuffle',route:'/shuffle',ua:devices['Pixel 7'].userAgent,expectVignette:false},
    ];
    for (const tc of tests) {
      const ctx = await browser.newContext({...devices['Pixel 7'], userAgent:tc.ua});
      const page = await ctx.newPage();
      const vignetteRequests=[];
      page.on('request',r=>{if(/n6wxm\.com\/vignette\.min\.js/.test(r.url()))vignetteRequests.push(r.url());});
      await page.route(/n6wxm\.com|5gvci\.com/,r=>r.abort());
      const response=await page.goto(base+tc.route,{waitUntil:'domcontentloaded',timeout:45000});
      assert.ok(response?.ok(),tc.name+': page navigation failed');
      await page.waitForTimeout(tc.name.startsWith('android-webview')?22000:2600);
      const flags=await page.evaluate(()=>({vignettes:[...document.scripts].filter(s=>/monetag-vignette|n6wxm\.com|11255233|11011520/.test((s.id||'')+' '+(s.src||'')+' '+(s.textContent||''))).map(s=>s.id||s.src),monetagScriptReady:document.body.classList.contains('sayittome-vignette-active'),path:location.pathname}));
      assert.deepEqual(flags.vignettes,[],tc.name+': vignette script injected');
      assert.equal(vignetteRequests.length,0,tc.name+': vignette requested');
      assert.equal(flags.monetagScriptReady,false,tc.name+': active CSS class');
      console.log('PASS_NO_VIGNETTE',tc.name,JSON.stringify(flags));
      await ctx.close();
    }
    console.log('PASS_ALL_AD_GUARDS');
  } finally {await browser.close()}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});