const {chromium, devices} = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless:true, args:["--no-sandbox"] });
  const out = [];
  try {
    for(const blocked of [false,true]){
      const page = await browser.newPage({...devices["Pixel 7"], viewport:{width:393,height:852}});
      await page.goto(process.env.SHUFFLE_E2E_URL || "http://localhost:3109/shuffle",{waitUntil:"domcontentloaded",timeout:60000});
      await page.waitForTimeout(5500);
      const s=await page.evaluate(blocked=>{
        document.body.classList.remove("sayittome-entry-legal-open");
        document.body.classList.add("sayittome-native-shell");
        document.documentElement.classList.add("sayittome-native-shell");
        for(const e of document.querySelectorAll('[role="dialog"], [data-entry-legal-overlay], .sayittome-entry-legal-overlay'))e.remove();
        const host=document.querySelector("#sayittome-shuffle-keepalive-host");
        if(!host)throw Error("Shuffle host absent");
        host.classList.add("sayittome-shuffle-keepalive-visible");
        const root=host.querySelector("main[data-scroll-root]");
        if(!root)throw Error("Shuffle root absent");
        root.style.overflowY="auto";
        let list=root.querySelector("[data-shuffle-list]");
        if(!list){list=document.createElement("div");list.setAttribute("data-shuffle-list","1");root.appendChild(list)}
        const fake=document.createElement("a");
        fake.href="/u/gesture-test";
        fake.setAttribute("data-shuffle-card","1");
        fake.style.cssText="display:block;width:100%;height:3100px;background:linear-gradient(#222,#444);";
        fake.textContent="Scrollable profile card";
        list.insertBefore(fake, list.firstChild);
        if(blocked){root.style.touchAction="none";list.style.touchAction="none";}
        root.scrollTop=0;
        window.__scrollGestureDebug={documentMoves:0,hostMoves:0,rootMoves:0,hostStarts:0,src:[]};
        document.addEventListener("touchmove",e=>{window.__scrollGestureDebug.documentMoves++;window.__scrollGestureDebug.src.push({kind:"document",target:e.target?.tagName,rootTop:root.scrollTop,canCancel:e.cancelable,hostClass:host.className});},{capture:true,passive:true});
        host.addEventListener("touchstart",e=>{window.__scrollGestureDebug.hostStarts++;},{capture:true,passive:true});
        host.addEventListener("touchmove",e=>{window.__scrollGestureDebug.hostMoves++;window.__scrollGestureDebug.src.push({kind:"host",target:e.target?.tagName,rootTop:root.scrollTop,canCancel:e.cancelable})},{capture:true,passive:true});
        root.addEventListener("touchmove",e=>{window.__scrollGestureDebug.rootMoves++;},{capture:true,passive:true});
        return {rootTouch:getComputedStyle(root).touchAction, listTouch:getComputedStyle(list).touchAction,height:root.scrollHeight,viewport:root.clientHeight,childAtPoint:document.elementFromPoint(220,710)?.tagName,fallbackStatus:host.dataset.shuffleTouchFallbackStatus};
      },blocked);
      assert.ok(s.height>s.viewport+1000,"fixture not scrollable");
      const sess=await page.context().newCDPSession(page);
      const position=()=>page.evaluate(()=>document.querySelector("#sayittome-shuffle-keepalive-host main[data-scroll-root]").scrollTop);
      async function evt(type,y){
        return sess.send("Input.dispatchTouchEvent",{type,touchPoints:type==="touchEnd"?[]:[{x:220,y,id:1}]});
      }
      const moves=[];
      for(let k=0;k<3;k++){
        const before=await position();
        await evt("touchStart",710);
        for(let j=1;j<=12;j++){
          await evt("touchMove",710-j*32);
          await page.waitForTimeout(30);
        }
        await evt("touchEnd",326);
        await page.waitForTimeout(500);
        const after=await position();
        moves.push({before,after,delta:after-before});
        if(after-before<130){const d=await page.evaluate(()=>{const el=document.elementFromPoint(220,710);const chain=[];let p=el;for(let n=0;n<7&&p;n++,p=p.parentElement)chain.push({tag:p.tagName,id:p.id,cls:String(p.className).slice(0,180),html:p.outerHTML?.slice(0,240),style:p.getAttribute("style")});return {events:window.__scrollGestureDebug,fallbackStatus:document.getElementById("sayittome-shuffle-keepalive-host").dataset.shuffleTouchFallbackStatus,chain,dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>({id:e.id,cls:String(e.className).slice(0,120)}))}});console.log("GESTURE_DEBUG",JSON.stringify({blocked,fixture:s,debug:d}));}
        assert.ok(after-before>=130,"Failed "+(blocked?"blocked-native":"normal-native")+" swipe "+k+": "+JSON.stringify(moves));
      }
      out.push({mode:blocked?"fallback-with-native-pan-blocked":"normal-native",...s,moves});
      await page.close();
    }
    console.log("PASS_SHUFFLE_ANDROID_ONE_FINGER_NATIVE_AND_FALLBACK",JSON.stringify(out,null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error("FAIL_SHUFFLE_ANDROID_ONE_FINGER_NATIVE_AND_FALLBACK",e.stack||e);process.exit(1)});
