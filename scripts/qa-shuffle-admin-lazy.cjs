const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const wrapper=fs.readFileSync('src/components/shuffle/ShuffleAdminControls.tsx','utf8');
const classic=fs.readFileSync('src/components/shuffle/ClassicShuffleProfileRow.tsx','utf8');
const modern=fs.readFileSync('src/components/modern/ModernShuffleCard.tsx','utf8');
const internal=fs.readFileSync('src/components/shuffle/ShuffleAdminControlsInternal.tsx','utf8');
for(const page of [classic,modern]){
 assert.match(page,/import ShuffleAdminControls from/);
 assert.doesNotMatch(page,/import AdminProfile(RoleplayButton|FakeButton|SafetyTagButtons|BlurPhotosButton)/);
}
assert.match(internal,/AdminProfileRoleplayButton/);
assert.match(internal,/AdminProfileFakeButton/);
assert.match(internal,/AdminProfileSafetyTagButtons/);
assert.match(internal,/AdminProfileBlurPhotosButton/);
assert.match(wrapper,/ssr: false/);
let admin=false,lazyLoaded=0;
const js=ts.transpileModule(wrapper,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const env={exports:{},require:id=>{
 if(id==='next/dynamic')return {default:loader=>{lazyLoaded++;return 'LAZY_COMPONENT'}};
 if(id==='@/hooks/useAdminSession')return {useAdminSession:()=>({ready:true,isAdmin:admin})};
 if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 throw Error(id);
}};
vm.runInNewContext(js,env);
const component=env.exports.default;
assert.equal(component({profile:{uid:'a'},variant:'classic'}),null,'non-admin must render no admin controls');
admin=true;
const rendered=component({profile:{uid:'a'},variant:'modern'});
assert.equal(rendered.type,'LAZY_COMPONENT');
assert.equal(rendered.props.variant,'modern');
assert.equal(lazyLoaded,1,'one lazily declared admin chunk');
console.log('PASS_SHUFFLE_ADMIN_CODE_SPLIT',JSON.stringify({adminControlsForVisitor:0,dedicatedAdminChunk:true,variants:['classic','modern']}));
