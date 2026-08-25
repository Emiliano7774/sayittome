/**
 * USUARIOS_RULES
 * Exclude usuarios from catch-all; owner/admin matrix via emulator.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "firestore.rules");
const rules = fs.readFileSync(rulesPath, "utf8");

assert.match(rules, /match \/usuarios\/\{uid\}/);
assert.match(rules, /function isAdmin\(\)/);
assert.match(rules, /touchesModerationTags/);
assert.match(rules, /isOwner\(uid\) && !touchesModerationTags\(\)/);
assert.match(rules, /\|\| isAdmin\(\)/);
assert.match(rules, /collection != 'usuarios'/);
assert.match(rules, /collection != 'viewOnceSecrets'/);
assert.doesNotMatch(rules, /string\(request\.path\)/);

const helperSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/usuarioModerationTagAdmin.ts"),
  "utf8",
);
assert.match(helperSrc, /createAuthedRestUsuarioModerationTagDeps/);
assert.match(helperSrc, /patchFirestoreDocAuthed/);
assert.doesNotMatch(helperSrc, /patchFirestoreDoc\(/);
assert.doesNotMatch(helperSrc, /getRepairAdminDb/);

const restSrc = fs.readFileSync(path.join(root, "src/lib/firestore/rest.ts"), "utf8");
assert.match(restSrc, /export async function patchFirestoreDocAuthed/);
assert.match(restSrc, /Authorization:\s*`Bearer \$\{token\}`/);

const routeSrc = fs.readFileSync(path.join(root, "src/app/api/admin/action/route.ts"), "utf8");
assert.match(routeSrc, /patchUsuarioAuthed|patchFirestoreDocAuthed/);
assert.match(routeSrc, /idToken/);
assert.doesNotMatch(
  routeSrc.slice(routeSrc.indexOf("tag_roleplay"), routeSrc.indexOf("toggle_media_blur")),
  /patchFirestoreDoc\(\s*"usuarios"/,
);

const harnessRunner = path.join(root, "scripts/usuarios-rules.emulator.mjs");
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
    `npx firebase emulators:exec --only firestore --project demo-sayittome-usuarios-rules "node scripts/usuarios-rules.emulator.mjs"`,
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
    throw new Error(`usuarios rules emulator failed (status=${result.status})`);
  }
}

assert.ok(
  emulatorPass || emulatorSkipReason === "java_missing",
  "emulator must PASS when Java is available",
);

console.log(
  JSON.stringify(
    {
      gate: "USUARIOS_RULES",
      pass: true,
      emulator: emulatorPass,
      skipReason: emulatorSkipReason || null,
    },
    null,
    2,
  ),
);
