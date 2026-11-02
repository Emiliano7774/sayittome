const assert=require("node:assert/strict");
const {build}=require("esbuild");
const React=require("react");
const ReactDOMServer=require("react-dom/server");
const path=require("node:path");
const Module=require("node:module");
const root=process.cwd();
const stubs={
  "components/stories/StoryAvatarButton":"export default function StoryAvatarButton(){return null}",
  "components/shuffle/ShuffleAdminControls":"export default function ShuffleAdminControls(){return null}",
  "components/profile/ProfileModerationBadges":"import React from 'react'; export default function ProfileModerationBadges(){return React.createElement('button',{type:'button','aria-label':'Perfil de rol'},'Perfil de rol')}",
  "components/shuffle/ShuffleModeratedIndicator":"export default function ShuffleModeratedIndicator(){return null}",
  "contexts/LocaleContext":"export function useT(){return key=>key}",
  "hooks/useClassicShuffleDensity":"export function useClassicShuffleDensity(){return {density:5}}",
  "lib/shuffle/classicDensity":"export function getClassicShuffleDensityTokens(){return {avatarSize:32,iconSize:16,nameClass:'name',bioClass:'bio'}}",
  "lib/shuffle/resolveShuffleBlur":"export function isShuffleProfileModerated(){return false}",
  "lib/shuffle/shuffleActionTargets":"export function storyOwnerUidFromShuffleCard(){return 'test'}",
  "lib/shuffle/dedupeProfiles":"export function shuffleProfileIdentityKey(p){return p.username}",
  "lib/shuffle/shuffleVisitorFresh":"export function isShuffleVisitorFresh(){return true}",
};
(async()=>{
 const response=await build({entryPoints:[path.join(root,"src/components/shuffle/ClassicShuffleProfileRow.tsx")],
  bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",
  external:["react","react/jsx-runtime"],plugins:[{name:"isolated-profile",setup(api){
    api.onResolve({filter:/^@\//},args=>({path:args.path.slice(2),namespace:"mock"}));
    api.onLoad({filter:/.*/,namespace:"mock"},args=>{
      if(!(args.path in stubs)) throw Error("Unmocked module "+args.path);
      return {contents:stubs[args.path],loader:"jsx"};
    });
  }}]});
 const m=new Module(path.join(root,"qa-classic-structure.cjs"),module);
 m.filename=path.join(root,"qa-classic-structure.cjs");
 m.paths=Module._nodeModulePaths(root);
 m._compile(response.outputFiles[0].text,m.filename);
 const Row=m.exports.default;
 assert.equal(typeof Row,"object","memo component export");
 const markup=ReactDOMServer.renderToStaticMarkup(React.createElement(Row,{profile:{uid:"test",username:"QA User",bio:"Test bio",moderationTag:"roleplay"},feedIndex:0}));
 const tags=markup.match(/<\/?button\b[^>]*>/g)||[];
 let level=0, nested=0;
 for(const tag of tags){if(tag.startsWith("</"))level--;else{if(level>0)nested++;level++}};
 assert.equal(level,0);
 assert.equal(nested,0,"moderation button cannot be inside chat button");
 assert.match(markup,/data-action="chat"/);
 assert.match(markup,/aria-label="Abrir chat con QA User"/);
 assert.match(markup,/aria-label="Perfil de rol"/);
 console.log("PASS_CLASSIC_SHUFFLE_INTERACTIVE_MARKUP",JSON.stringify({nestedButtons:nested,chatActions:(markup.match(/data-action="chat"/g)||[]).length,warningButtons:(markup.match(/aria-label="Perfil de rol"/g)||[]).length,htmlLength:markup.length}));
})().catch(e=>{console.error("FAIL",String(e.stack||e));process.exitCode=1});
