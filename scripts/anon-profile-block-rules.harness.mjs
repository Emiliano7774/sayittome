/**
 * ANON_PROFILE_BLOCK_RULES
 * Client cannot forge anon_profile_blocks; profile→anon mensaje create denied when blocked.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const client = fs.readFileSync(path.join(root, "src/lib/abuse/anonProfileBlocks.ts"), "utf8");
const fnSrc = fs.readFileSync(path.join(root, "functions/src/anonProfileBlock.ts"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");

assert.match(rules, /match \/anon_profile_blocks\/\{blockId\}/);
assert.match(rules, /allow write: if false/);
assert.match(rules, /collection != 'anon_profile_blocks'/);
assert.match(rules, /collection != 'chats'/);
assert.match(rules, /chatBlocksProfile/);
assert.match(rules, /isBlockedProfileAuthor/);
assert.match(rules, /anonBlocksProfile/);
assert.doesNotMatch(rules, /string\(request\.path\)/);

assert.match(client, /setAnonProfileBlock/);
assert.match(client, /httpsCallable/);
assert.doesNotMatch(client, /setDoc\(/);
assert.doesNotMatch(client, /deleteDoc\(/);

assert.match(fnSrc, /handleSetAnonProfileBlock/);
assert.match(fnSrc, /assertAnonVisitorMayManageBlock/);
assert.match(fnSrc, /permission-denied/);
assert.match(indexSrc, /export const setAnonProfileBlock/);

const harnessRunner = path.join(root, "scripts/anon-profile-block-rules.emulator.mjs");
assert.ok(fs.existsSync(harnessRunner));

const javaOk =
  spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0 ||
  spawnSync("java", ["-version"], { encoding: "utf8", shell: true }).status === 0;

let emulatorPass = false;
let emulatorSkipReason = "";

if (!javaOk) {
  emulatorSkipReason = "java_missing";
} else {
  const result = spawnSync(
    `npx firebase emulators:exec --only firestore --project demo-sayittome-anon-block-rules "node scripts/anon-profile-block-rules.emulator.mjs"`,
    {
      cwd: root,
      encoding: "utf8",
      shell: true,
      timeout: 180_000,
    },
  );
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 && out.includes('"pass": true')) {
    emulatorPass = true;
  } else {
    console.error(out);
    throw new Error(`anon profile block rules emulator failed (status=${result.status})`);
  }
}

assert.ok(
  emulatorPass || emulatorSkipReason === "java_missing",
  "emulator must PASS when Java is available",
);

console.log(
  JSON.stringify(
    {
      gate: "ANON_PROFILE_BLOCK_RULES",
      pass: true,
      emulator: emulatorPass,
      skipReason: emulatorSkipReason || null,
    },
    null,
    2,
  ),
);
