import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("src/services/anonymousPresence.ts", "utf8");
const start = source.indexOf("async function postPresenceHeartbeat(");
const end = source.indexOf("\nfunction adoptServerPresenceAlias(", start);
assert.ok(start !== -1 && end > start, "presence sender exists");
const tsFn = source.slice(start, end);
const javascript = ts.transpileModule(tsFn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const requests = [];
const sandbox = {
  AbortSignal,
  JSON,
  PRESENCE_FETCH_TIMEOUT_MS: 12_000,
  resolveLegacyAnonPresenceCleanupId: () => "",
  readLegacyLocalId: () => "",
  getAnonSessionId: () => "test_session",
  readVisibilityPayload: () => ({}),
  fetch: async (path, options) => {
    requests.push({path, options});
    return {ok:true, json:async()=>({ok:true, anonId:"anon_fixture"})};
  },
};
vm.runInNewContext(javascript + "\nthis.send = postPresenceHeartbeat;", sandbox);
for(let i=0; i<8; i++){
  await sandbox.send("anon_fixture",{Authorization:"Bearer test"},true);
  await sandbox.send("anon_fixture",{Authorization:"Bearer test"},false);
}
assert.equal(requests.length,16);
for(let i=0; i<requests.length; i++){
  const {path,options}=requests[i];
  assert.equal(path,"/api/anonymous-presence");
  const body=JSON.parse(options.body);
  assert.equal(body.backgrounded, i%2===0, "transition encoded correctly "+i);
  assert.equal(options.keepalive === true, i%2===0, "background survives Chrome/Brave suspension "+i);
  assert.equal(Boolean(options.signal), i%2!==0, "foreground retains bounded timeout "+i);
}
assert.match(source, /const headers = backgrounded && leaveHeaders \? leaveHeaders : await authHeaders\(\)/, "blur uses already-cached auth without extra await");
assert.match(source, /if \(!anonymousForegroundActive\(\)\) return;/, "no 90s background polling");
assert.match(source, /window\.addEventListener\("blur",/, "PC window lost focus observed");
assert.match(source, /document\.addEventListener\("visibilitychange",/, "Android tab hidden observed");
assert.match(source, /window\.addEventListener\("focus",/, "PC window reacquired focus observed");
console.log("PASS 8 background/foreground cycles: cached auth, browser keepalive, frozen background flag, foreground timeout, no extra listener/poll");
