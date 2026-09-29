/**
 * Anon-match Do Not Disturb + reject-until-chat-close contract.
 *   node --experimental-strip-types scripts/anon-match-dnd.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const dnd = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/doNotDisturb.ts")).href
);
const rejected = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/rejectedMatchTargets.ts")).href
);

assert.deepEqual([...dnd.ANON_MATCH_DND_MINUTE_OPTIONS], [5, 15, 30, 60]);
assert.equal(dnd.normalizeAnonMatchDndMinutes(15), 15);
assert.equal(dnd.normalizeAnonMatchDndMinutes(3), null);
assert.equal(dnd.normalizeAnonMatchDndMinutes(200), null);
assert.equal(dnd.isAnonMatchDoNotDisturbActive(new Date(Date.now() + 60_000).toISOString()), true);
assert.equal(dnd.isAnonMatchDoNotDisturbActive(new Date(Date.now() - 60_000).toISOString()), false);

assert.equal(
  rejected.resolveRejectedMatchTargetKey({ destinatarioTipo: "anonimo", anonId: "anon_x" }),
  "anon_x",
);
assert.deepEqual(rejected.splitRejectedMatchTargets(["anon_a", "uid_b"]), {
  excludeAnonIds: ["anon_a"],
  excludeUids: ["uid_b"],
});

const routeSrc = fs.readFileSync(
  path.join(root, "src/app/api/anon-match/dnd/route.ts"),
  "utf8",
);
const poolSrc = fs.readFileSync(path.join(root, "src/lib/anonMatch/matchPool.ts"), "utf8");
const modalSrc = fs.readFileSync(
  path.join(root, "src/components/anonMatch/AnonMatchIncomingModal.tsx"),
  "utf8",
);
const contextSrc = fs.readFileSync(
  path.join(root, "src/contexts/AnonMatchContext.tsx"),
  "utf8",
);

assert.match(routeSrc, /doNotDisturbUntil/);
assert.match(routeSrc, /anonMatchDoNotDisturbUntil/);
assert.match(poolSrc, /isAnonMatchDoNotDisturbActive/);
assert.match(modalSrc, /anon_match_dnd_label/);
assert.match(modalSrc, /enableDoNotDisturb/);
assert.match(contextSrc, /enableDoNotDisturb/);
assert.match(contextSrc, /rememberRejectedMatchTarget/);
assert.match(contextSrc, /clearRejectedMatchTargets/);
assert.match(contextSrc, /isLocalAnonMatchDndActive/);

console.log(JSON.stringify({ gate: "ANON_MATCH_DND", pass: true }, null, 2));
