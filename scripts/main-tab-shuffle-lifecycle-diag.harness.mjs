/**
 * Lifecycle diagnostic harness — 1000 permutations.
 * Run: node scripts/main-tab-shuffle-lifecycle-diag.harness.mjs
 */

import assert from "node:assert/strict";
import { runLifecycleHarness } from "./main-tab-shuffle-lifecycle-diag-core.mjs";

const { pass, fail, total, failures } = runLifecycleHarness(1000);

assert.equal(total, 1000, "expected 1000 permutations");
assert.equal(fail, 0, `lifecycle harness failures: ${JSON.stringify(failures.slice(0, 5))}`);
assert.equal(pass, 1000, "LIFECYCLE_DIAGNOSTIC_HARNESS must be 1000/1000");

console.log(`LIFECYCLE_DIAGNOSTIC_HARNESS = ${pass}/${total} PASS`);
