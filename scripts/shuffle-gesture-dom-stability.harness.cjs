const esbuild = require("esbuild");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const mods = {
    "@/contexts/LocaleContext": 'export function useT(){return (key)=>key}',
    "@/components/monetization/ShuffleAdSlot": 'export default function ShuffleAdSlot(){return null}',
    "@/hooks/useHydrationReady": 'export function useHydrationReady(){return true}',
    "@/lib/shuffle/shuffleFeedAds": [
      'export function getShuffleAdSlotId(mode,n){return mode+n}',
      'export function getShuffleFeedItemCount(n){return n}',
      'export function getShuffleProfileIndex(n){return n}',
      'export function isShuffleNativeAdIndex(){return false}',
      'export function shouldShowShuffleFeedAds(){return false}',
    ].join("\n"),
    "@/lib/shuffle/shuffleSlotsStore": [
      'let version=1;let people=[{uid:"a",username:"Alice"},{uid:"b",username:"Bob"}];const watchers=new Set();',
      'export function getServerShuffleSlotsVersion(){return 0}',
      'export function getShuffleSlotsVersion(){return version}',
      'export function getShuffleWindowGeneration(){return version}',
      'export function getVisibleShuffleProfiles(){return people}',
      'export function subscribeAllShuffleSlots(cb){watchers.add(cb);return()=>watchers.delete(cb)}',
      'export function __replace(list){people=list;version++;watchers.forEach(cb=>cb())}',
    ].join("\n"),
    "@/lib/shuffle/shuffleOnlineFilterNotice": [
      'export function getShuffleSoloOnlineFilter(){return false}',
      'export function subscribeShuffleSoloOnlineFilter(){return()=>{}}',
      'export function requestClearShuffleSoloOnline(){}',
    ].join("\n"),
  };
  const entry = [
    'import React from "react";',
    'import {createRoot} from "react-dom/client";',
    'import Feed from "./src/components/shuffle/ShuffleFeedWithNativeAds";',
    'import {__replace} from "@/lib/shuffle/shuffleSlotsStore";',
    'import {startShuffleTouchGesture,endShuffleTouchGesture} from "@/lib/shuffle/shuffleTouchStability";',
    'import {useStableShuffleSurfaceMode} from "./src/hooks/useStableShuffleSurfaceMode";',
    'function Outer(){',
    '  const [requestedMode,setRequestedMode]=React.useState("feed");',
    '  window.__setMode=setRequestedMode;',
    '  const actualMode=useStableShuffleSurfaceMode(requestedMode);',
    '  return actualMode==="feed"',
    '    ? <Feed mode="classic" variant="list" renderProfile={(person,index)=><button type="button" key={person.uid} data-id={person.uid} data-index={index}>{person.username}</button>}/>',
    '    : <div data-loading="1">Loading</div>;',
    '}',
    'window.__beginTouch=startShuffleTouchGesture;',
    'window.__endTouch=endShuffleTouchGesture;',
    'window.__refreshCards=__replace;',
    'createRoot(document.getElementById("root")).render(<Outer/>);',
  ].join("\n");
  const bundle=await esbuild.build({
    stdin:{contents:entry,resolveDir:root,sourcefile:"touch-gesture-test-entry.tsx",loader:"tsx"},
    bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",
    plugins:[{
      name:"standalone-alias-stubs",
      setup(build){
        build.onResolve({filter:/^@\//},args=>{
          if(args.path==="@/lib/shuffle/shuffleTouchStability")return {path:path.join(root,"src/lib/shuffle/shuffleTouchStability.ts")};
          if(Object.hasOwn(mods,args.path))return {path:args.path,namespace:"stub"};
          throw Error("Unexpected import "+args.path);
        });
        build.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:mods[args.path],loader:"js"}));
      }
    }]
  });
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  try{
    const page=await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.locator('[data-id="a"]').waitFor();
    const before=await page.evaluate(()=>{
      window.__held=document.querySelector('[data-id="a"]');
      return [...document.querySelectorAll('[data-id]')].map(n=>n.dataset.id);
    });
    assert.deepEqual(before,["a","b"]);
    await page.evaluate(()=>{
      window.__beginTouch();
      window.__refreshCards([{uid:"c",username:"Claire"},{uid:"b",username:"Bob"}]);
    });
    await page.waitForTimeout(200);
    const inGesture=await page.evaluate(()=>({
      heldConnected:window.__held.isConnected,
      feedIds:[...document.querySelectorAll('[data-id]')].map(n=>n.dataset.id),
      generation:document.querySelector('[data-shuffle-list]')?.getAttribute('data-window-generation'),
    }));
    assert.equal(inGesture.heldConnected,true,"Touch target was removed mid-gesture");
    assert.deepEqual(inGesture.feedIds,["a","b"],"Feed changed while finger was down");
    assert.equal(inGesture.generation,"1","Window generation changed during touch");
    await page.evaluate(()=>window.__endTouch());
    await page.locator('[data-id="c"]').waitFor();
    const released=await page.evaluate(()=>({
      ids:[...document.querySelectorAll('[data-id]')].map(n=>n.dataset.id),
      generation:document.querySelector('[data-shuffle-list]')?.getAttribute('data-window-generation'),
    }));
    assert.deepEqual(released.ids,["c","b"],"Feed did not refresh on release");
    assert.equal(released.generation,"2");
    await page.evaluate(()=>{
      window.__beginTouch();
      window.__setMode("loading");
    });
    await page.waitForTimeout(200);
    const modeHeld=await page.evaluate(()=>({
      targetConnected:document.querySelector('[data-id="c"]')?.isConnected??false,
      visible:!!document.querySelector('[data-shuffle-list]'),
    }));
    assert.equal(modeHeld.visible,true,"Transient loading unmounted feed mid-touch");
    assert.equal(modeHeld.targetConnected,true);
    await page.evaluate(()=>window.__endTouch());
    await page.locator("[data-loading]").waitFor();
    console.log("SHUFFLE_GESTURE_DOM_STABILITY_PASS",JSON.stringify({before,inGesture,released,modeHeld}));
  }finally{await browser.close()}
})().catch(e=>{console.error("SHUFFLE_GESTURE_DOM_STABILITY_FAIL",e.stack||e);process.exit(1)});
