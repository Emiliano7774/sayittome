/**
 * TRACE_ARCHIVE_SOFTNAV_TX_CAPTURE_HARNESS entry.
 */
import assert from "node:assert/strict";
import { runTraceArchiveSoftNavTxCaptureHarness } from "./trace-archive-softnav-tx-capture.harness.mjs";

const { pass, fail, total, failures, invariants } = runTraceArchiveSoftNavTxCaptureHarness(10_000);
assert.equal(total, 10_000);
assert.equal(fail, 0, `failures: ${JSON.stringify(failures.slice(0, 5))}`);
assert.equal(pass, 10_000);
assert.equal(invariants.SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX, true);
assert.equal(invariants.MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_FORBIDDEN_AS_GENERIC_NO_TX, true);
assert.equal(invariants.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY, true);
assert.equal(invariants.NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY, true);

console.log(`TRACE_ARCHIVE_SOFTNAV_TX_CAPTURE_HARNESS = ${pass}/${total} PASS`);
console.log(JSON.stringify(invariants));
