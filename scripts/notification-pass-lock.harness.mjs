import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const manifest = new URL("./notification-pass-lock.json", import.meta.url);
const original = readFileSync(manifest,"utf8");
const check = () => spawnSync(process.execPath, ["scripts/notification-pass-lock.mjs"], {
  encoding:"utf8", cwd:process.cwd(),
});
const ok=check();
assert.equal(ok.status,0,"original PASS ABSOLUTO snapshot must pass: "+ok.stderr);
try {
  const altered=JSON.parse(original);
  const target="public/chat-notify/sw.js";
  altered.files[target]="0".repeat(64);
  writeFileSync(manifest,JSON.stringify(altered,null,2)+"\n");
  const blocked=check();
  assert.notEqual(blocked.status,0,"changed notification code must halt build");
  assert.match(blocked.stderr,/NOTIFICACIONES WEB BLINDADAS/,"big warning visible");
  assert.match(blocked.stderr,/ANDROID WEB.*PC WEB/,"both platforms warned");
  assert.match(blocked.stderr,/CAMBIO BLOQUEADO/,"explicit block banner");
  assert.match(blocked.stderr,/public\/chat-notify\/sw\.js/,"file called out");
} finally {
  writeFileSync(manifest,original);
}
assert.equal(check().status,0,"after restore lock must pass again");
console.log("PASS notification PASS ABSOLUTO lock: intact succeeds, altered fingerprint BLOCKED with huge bilingual-platform warning, restore succeeds");
