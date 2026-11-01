const fs=require("fs"),ts=require("typescript"),{chromium}=require("playwright");
(async()=>{
const source=fs.readFileSync("src/lib/chat/presentChatThread.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
const page=await browser.newPage();
await page.route("http://qa.local/**",r=>r.fulfill({status:200,contentType:"text/html",body:"<html><body><div id='root'></div></body></html>"}));
await page.goto("http://qa.local/");
await page.addScriptTag({content:"(()=>{const exports={};"+js+";window.__chatOpenTest=exports})()"});
const results=[];
for(const name of ["first","second","third"]){
await page.evaluate(name=>{window.history.pushState({},"","/chats");window.__chatOpenTest.presentChatThreadNow("/chat/"+name);window.history.pushState({},"","/chat/"+name)},name);
const start=Date.now();
await page.evaluate(()=>{const node=document.createElement("div");node.setAttribute("data-chat-bubbles-settled","1");document.body.appendChild(node)});
await page.waitForFunction(()=>!document.getElementById("sayittome-chat-open-shell"),{timeout:1200});
const elapsed=Date.now()-start;results.push({name,elapsedMs:elapsed});
await page.evaluate(()=>document.querySelector("[data-chat-bubbles-settled]")?.remove());
}
await page.evaluate(()=>{window.history.pushState({},"","/chats");window.__chatOpenTest.presentChatThreadNow("/chat/old");window.__chatOpenTest.presentChatThreadNow("/chat/new");window.history.pushState({},"","/chat/new");const mark=document.createElement("div");mark.setAttribute("data-chat-bubbles-settled","1");document.body.appendChild(mark)});
await page.waitForFunction(()=>!document.getElementById("sayittome-chat-open-shell"),{timeout:1200});
console.log("PASS_CHAT_THREAD_MUTATION_READY",JSON.stringify(results));
}finally{await browser.close()}
})().catch(e=>{console.error("FAIL_CHAT_THREAD_MUTATION_READY",e.stack||e);process.exitCode=1});