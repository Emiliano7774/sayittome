/**
 * LOCAL_TRANSITION_PRECOMMIT_ARMING_RELEASE_CHECK — 5/5
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateTransitionPrecommitArming } from "./transition-precommit-arming.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir =
  process.argv[2] ||
  path.join(__dirname, "ghost-filmstrip-out", "transition-precommit-arming-check");
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  {
    name: "1-normal-history-clean",
    input: {
      commitMode: "history",
      nativeLifecycleAfterFinal: { run: 1, start: 1, end: 1 },
    },
    check: (r) =>
      r.precommitWritten &&
      r.barrierPassed &&
      r.finalWriteOccurred &&
      r.nativeOk &&
      r.releaseClean === true &&
      r.PRECOMMIT_BEFORE_FINAL_WRITE === true,
  },
  {
    name: "2-same-frame-coalescing-risk-separated",
    input: { sameFrameInitialAndFinal: true, barrierFrames: 2 },
    check: (r) =>
      r.framesPassed === 2 &&
      r.finalWriteOccurred &&
      r.PRECOMMIT_BEFORE_FINAL_WRITE === true,
  },
  {
    name: "3-stale-tx-during-barrier",
    input: { staleDuringBarrier: true, staleAtFrame: 1 },
    check: (r) =>
      r.aborted === true &&
      r.finalWriteOccurred === false &&
      r.pinCleared === true,
  },
  {
    name: "4-native-absent-despite-barrier",
    input: { nativeLifecycleAfterFinal: { run: 0, start: 0, end: 0 } },
    check: (r) =>
      r.releaseClean === false &&
      r.primaryFailureClass ===
        "NATIVE_TRANSITION_NEVER_STARTED_AFTER_VALID_FINAL_WRITE" &&
      r.secondaryFailure === "PRECOMMIT_BARRIER_DID_NOT_PRODUCE_NATIVE_START",
  },
  {
    name: "5-logical-settle-without-native",
    input: {
      nativeLifecycleAfterFinal: { run: 0, start: 0, end: 0 },
      bridgeComplete: true,
      pinClear: true,
    },
    check: (r) =>
      r.releaseClean === false &&
      r.logicalSettleWithoutNativeTransition === true,
  },
];

const results = cases.map((c) => {
  const r = simulateTransitionPrecommitArming(c.input);
  const pass = c.check(r);
  return { name: c.name, pass, releaseClean: r.releaseClean, primary: r.primaryFailureClass };
});

const passCount = results.filter((r) => r.pass).length;
const report = {
  LOCAL_TRANSITION_PRECOMMIT_ARMING_RELEASE_CHECK: `${passCount}/${cases.length}`,
  pass: passCount === cases.length,
  results,
};
fs.writeFileSync(path.join(outDir, "transition-precommit-arming-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(passCount === cases.length ? 0 : 1);
