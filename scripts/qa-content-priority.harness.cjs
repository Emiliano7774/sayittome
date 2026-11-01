const fs=require("fs"),ts=require("typescript"),vm=require("vm"),assert=require("node:assert/strict");
const transpile=p=>ts.transpileModule(fs.readFileSync(p,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const scheduled=[],cancelled=[];
const hooks={useCallback:fn=>fn,useRef:value=>({current:value}),useEffect:()=>undefined};
const a={exports:{},require:id=>{
 if(id==="react")return hooks;
 if(id==="@/lib/profile/prefetchPublicProfile")return {cancelProfilePrefetch:name=>cancelled.push(name),scheduleProfilePrefetch:name=>scheduled.push(name)};
 throw Error(id);
}};
vm.runInNewContext(transpile("src/hooks/useProfilePrefetchIntent.ts"),a);
const result=a.exports.useProfilePrefetchIntent("example");
result.onPointerEnter({pointerType:"touch"});result.onPointerEnter({pointerType:"mouse"});
assert.deepEqual(scheduled,["example"],"only hover should warm profile data");
assert.equal(result.onPointerDown,undefined,"tap must not duplicate the authoritative profile request");
const images=[];
class FakeImage{
 constructor(){images.push(this);this.fetchPriority="auto";}
 set src(v){this.url=v;}
 get src(){return this.url;}
}
const w={exports:{},require:id=>{throw Error(id)},Image:FakeImage,window:{},setTimeout:()=>undefined};
vm.runInNewContext(transpile("src/lib/shuffle/warmImages.ts"),w);
const profiles=Array.from({length:8},(_,i)=>({photo:"https://example.org/"+i+".jpg"}));
w.exports.warmShuffleImages(profiles,8,{urgent:true});
assert.deepEqual(images.map(i=>i.fetchPriority),["high","high","high","high","low","low","low","low"]);
w.exports.warmShuffleImages(profiles,8,{urgent:true});
assert.equal(images.length,8,"avoid duplicate speculative downloads");
images[0].onerror();
w.exports.warmShuffleImages([profiles[0]],1,{urgent:true});
assert.equal(images.length,9,"failed download must be retryable");
console.log("PASS_CONTENT_PRIORITY",JSON.stringify({desktopHoverRequests:scheduled.length,touchNetworkWarmup:0,immediateAvatars:4,speculativeLowPriority:4,failedImageRetry:true}));