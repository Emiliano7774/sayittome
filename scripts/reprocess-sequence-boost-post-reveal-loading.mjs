/**
 * Reprocess staged-rollout-final-bidirectional-no-loading-1784017225079
 * for sequence-only Shuffle→Boost post-reveal loading failure.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const failedRoot =
  process.argv[2] ||
  "scripts/ghost-filmstrip-out/staged-rollout-final-bidirectional-no-loading-1784017225079";
const out =
  process.argv[3] ||
  path.join(
    "scripts/ghost-filmstrip-out",
    `reprocess-sequence-boost-${Date.now()}.json`,
  );

const summaryPath = [
  path.join(failedRoot, "fresh-anon-prod", "fresh-anon-8dir-summary.json"),
  path.join(failedRoot, "fresh-anon-bidirectional-prod-8dir-summary.json"),
  path.join(failedRoot, "failed-rollout-summary.json"),
].find((p) => fs.existsSync(p));

if (!summaryPath) {
  console.error("missing summary in", failedRoot);
  process.exit(2);
}

const sum = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const hop =
  (sum.directions || []).find((d) => d.source === "shuffle" && d.dest === "boost") ||
  null;

const gate = hop
  ? evaluateBidirectionalTabNoLoadingVisualGate(hop)
  : { pass: false, status: "MISSING_HOP" };

const report = {
  artifact: failedRoot,
  OLD_FINAL_ROLLOUT_SHUFFLE_BOOST_POST_REVEAL_LOADING_FAIL:
    hop?.classification === "DESTINATION_LOADING_VISIBLE" &&
    hop?.midLoadingAfterRevealCount === 1 &&
    hop?.anyLoadingText === true,
  NEW_SEQUENCE_BOOST_STABILITY_FIX_REQUIRED: true,
  BOOST_POST_COMMIT_LOADING_REBOUND_BLOCKED: true,
  hopClassification: hop?.classification ?? null,
  midLoadingAfterRevealCount: hop?.midLoadingAfterRevealCount ?? null,
  mainLoadingTextInMid: hop?.midLoadingTail?.[0]?.mainLoadingText === true,
  targetedStillInsufficient:
    "targeted 3/3 pass does not imply sequential 8-dir pass",
  gateStillFailsOldHop: gate.pass === false,
  overstatedClean: false,
  classifications: sum.classifications,
};

fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(
  report.OLD_FINAL_ROLLOUT_SHUFFLE_BOOST_POST_REVEAL_LOADING_FAIL &&
    report.gateStillFailsOldHop
    ? 0
    : 2,
);
