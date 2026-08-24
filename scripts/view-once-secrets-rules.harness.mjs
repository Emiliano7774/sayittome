/**
 * VIEW_ONCE_SECRETS_RULES
 * Deny-all for viewOnceSecrets with catch-all OR-exclusion; emulator access checks.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "firestore.rules");
const firebaseJsonPath = path.join(root, "firebase.json");
const backupDir = path.join(root, "scripts/backups");

const rules = fs.readFileSync(rulesPath, "utf8");
assert.match(rules, /match \/viewOnceSecrets\/\{secretId\}/);
assert.match(rules, /allow read, write: if false;/);
assert.match(
  rules,
  /!document\.matches\('viewOnceSecrets\(\/\.\*\)\?'\)/,
  "catch-all must exclude viewOnceSecrets (OR semantics)",
);
assert.match(rules, /request\.time < timestamp\.date\(2026, 12, 31\)/);
assert.match(rules, /usuarios_shuffle_lite/);
assert.match(rules, /chat_inbox_lite/);
assert.match(rules, /photo_moderation_chats/);

const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, "utf8"));
assert.equal(firebaseJson.firestore?.rules, "firestore.rules");

const backups = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((f) => f.includes("firestore.rules.prod"))
  : [];
assert.ok(backups.length >= 1, "prod rules backup must exist under scripts/backups");

const harnessRunner = path.join(root, "scripts/view-once-secrets-rules.emulator.mjs");
assert.ok(fs.existsSync(harnessRunner), "emulator access harness missing");

const javaOk =
  spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0 ||
  spawnSync("java", ["-version"], { encoding: "utf8", shell: true }).status === 0;

let emulatorPass = false;
let emulatorSkipReason = "";

if (!javaOk) {
  emulatorSkipReason = "java_missing";
} else {
  const result = spawnSync(
    `npx firebase emulators:exec --only firestore --project demo-sayittome-viewonce "node scripts/view-once-secrets-rules.emulator.mjs"`,
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
    throw new Error(`firestore emulator rules harness failed (status=${result.status})`);
  }
}

if (!emulatorPass && emulatorSkipReason) {
  // Static deny+exclusion is mandatory; emulator is preferred when Java is available.
  console.warn(
    JSON.stringify({
      gate: "VIEW_ONCE_SECRETS_RULES",
      emulator: "skipped",
      reason: emulatorSkipReason,
      static: true,
    }),
  );
}

assert.ok(
  emulatorPass || emulatorSkipReason === "java_missing",
  "emulator must PASS when Java is available",
);

console.log(
  JSON.stringify(
    {
      gate: "VIEW_ONCE_SECRETS_RULES",
      pass: true,
      emulator: emulatorPass,
      backupCount: backups.length,
    },
    null,
    2,
  ),
);
