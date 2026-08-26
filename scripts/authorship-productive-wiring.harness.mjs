/**
 * AUTHORSHIP_PRODUCTIVE_WIRING — mark→seal→apply path without ambiguous role invent.
 * Apply remains APPLY_FROZEN (0 message writes). Gate proves safe gaps.
 *   node --experimental-strip-types scripts/authorship-productive-wiring.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const panel = fs.readFileSync(
  path.join(root, "src/components/admin/panels/AdminAuthorshipRepairPanel.tsx"),
  "utf8",
);
const previewRoute = fs.readFileSync(
  path.join(root, "src/app/api/admin/authorship-repair/preview/route.ts"),
  "utf8",
);
const applyRoute = fs.readFileSync(
  path.join(root, "src/app/api/admin/authorship-repair/apply/route.ts"),
  "utf8",
);
const rollbackRoute = fs.readFileSync(
  path.join(root, "src/app/api/admin/authorship-repair/rollback/route.ts"),
  "utf8",
);
const page = fs.readFileSync(path.join(root, "src/app/admin/authorship/page.tsx"), "utf8");
const writer = fs.readFileSync(
  path.join(root, "src/lib/chat/historicalAuthorshipRepairWrite.ts"),
  "utf8",
);
const inventory = fs.readFileSync(
  path.join(root, "scripts/inventory-historical-authorship-queue.mjs"),
  "utf8",
);

assert.match(page, /AdminAuthorshipRepairPanel/);
assert.match(panel, /markFromPerspective/);
assert.match(panel, /mío|de la otra|mine/);
assert.match(panel, /authorship-repair\/preview/);
assert.match(panel, /authorship-repair\/apply/);
assert.match(panel, /authorship-repair\/rollback/);
// Zero ambiguity: no proposed.senderRole fallback in buildSelections.
assert.doesNotMatch(panel, /row\.proposed\?\.senderRole/);
assert.match(panel, /if \(!mark\) return \[\]/);
assert.match(panel, /APPLY_FROZEN/);

// Sealed preview always persisted (even while frozen).
assert.match(previewRoute, /authorshipRepairPreviews/);
assert.doesNotMatch(
  previewRoute,
  /if \(!HISTORICAL_REPAIR_APPLY_FROZEN\) \{\s*[\s\S]*authorshipRepairPreviews/,
);
assert.match(previewRoute, /applyFrozenAtSeal/);

assert.match(applyRoute, /HISTORICAL_REPAIR_APPLY_FROZEN/);
assert.match(rollbackRoute, /HISTORICAL_REPAIR_APPLY_FROZEN/);
assert.match(writer, /backupJson|AUTHOR_BACKUP_KEYS/);
assert.match(writer, /evaluateOccAllOrNone|OCC/);

assert.match(inventory, /eligibleIdentity/);
assert.match(inventory, /needsHumanMarks/);
assert.match(inventory, /blockedIdentity/);
assert.match(inventory, /writes: 0/);
assert.doesNotMatch(inventory, /desiredRole|senderRole:\s*[\"']profile/);

const repair = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalAuthorshipRepair.ts")).href
);
assert.equal(repair.HISTORICAL_REPAIR_APPLY_FROZEN, true, "apply stays frozen — 0 role writes");

const lastPath = path.join(root, "scripts/inventory-historical-authorship-last.json");
if (fs.existsSync(lastPath)) {
  const last = JSON.parse(fs.readFileSync(lastPath, "utf8"));
  assert.equal(last.apply, false);
  assert.equal(last.writes, 0);
  assert.equal(typeof last.scannedChats, "number");
  assert.equal(typeof last.messagesMissingRole, "number");
  assert.equal(typeof last.needsHumanMarks, "number");
  assert.equal(typeof last.blockedIdentity, "number");
}

console.log("PASS authorship-productive-wiring");
