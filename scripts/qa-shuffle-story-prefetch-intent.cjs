const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/components/stories/StoryAvatarButton.tsx','utf8');
const classic=fs.readFileSync('src/components/shuffle/ClassicShuffleProfileRow.tsx','utf8');
assert.match(classic,/prefetchStoryMedia=\{photoLoading === "eager"\}/);
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let prefetches=[],navigation=[],hasStories=true;
const jsx=(type,props)=>({type,props});
const imports={
 'react':{memo:fn=>fn,useEffect:fn=>fn()},
 'react/jsx-runtime':{jsx,jsxs:jsx},
 'next/navigation':{useRouter:()=>({})},
 'lucide-react':{UserRound:'AvatarFallback'},
 '@/components/stories/StoryRing':{default:'Ring'},
 '@/hooks/useStoryStatus':{useStoryStatus:()=>({hasActive:hasStories,hasUnseen:hasStories,storyCount:2,storyPath:hasStories?'/stories/owner':''})},
 '@/hooks/useProfilePrefetchIntent':{useProfilePrefetchIntent:()=>({})},
 '@/lib/chat/anonAvatarStyle':{classicAnonAvatarColor:()=> '#333'},
 '@/lib/navigation/fastNavigate':{fastRouterPush:(_,path)=>navigation.push(path)},
 '@/lib/stories/storiesIndexStore':{prefetchOwnerStories:(u,n)=>prefetches.push(u+'|'+n)},
};
const context={exports:{},require:id=>{if(!(id in imports))throw Error('Unexpected import '+id);return imports[id]},console};
vm.runInNewContext(js,context);
const Component=context.exports.default;
function tap(button){assert.equal(button.type,'button');button.props.onClick({preventDefault(){},stopPropagation(){}})}
const args={ownerUid:'owner',username:'visitor',mode:'delegate',photo:''};
const inShuffle=Component({...args,prefetchStoryMedia:false});
assert.equal(prefetches.length,0,'Shuffle must not automatically prefetch story media for every visible card');
tap(inShuffle);
assert.deepEqual(prefetches,['owner|visitor'],'tapping an unseen story prefetches its media exactly once');
assert.deepEqual(navigation,['/stories/owner'],'tapped story still navigates');
prefetches=[];navigation=[];
const inStoriesHub=Component(args);
assert.deepEqual(prefetches,['owner|visitor'],'stories surfaces preserve their existing proactive prefetch');
tap(inStoriesHub);
assert.equal(prefetches.length,1,'story tap must not duplicate an already-started speculative prefetch');
assert.deepEqual(navigation,['/stories/owner']);
prefetches=[];navigation=[];hasStories=false;
const noStory=Component({...args,prefetchStoryMedia:false,mode:'navigate'});
assert.equal(prefetches.length,0);
tap(noStory);
assert.deepEqual(navigation,['/u/visitor'],'without active stories profile navigation must remain intact');
console.log('PASS_SHUFFLE_STORY_PREFETCH_ONLY_ON_INTENT',JSON.stringify({idleShuffleMediaFetches:0,tappedPreload:1,hubPreloadPreserved:true,profileNavigationPreserved:true}));
