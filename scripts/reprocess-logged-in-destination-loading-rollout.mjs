/**
 * Reprocess staged-rollout-boost-sequence-final logged-in destination loading failure.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const prev = process.argv[2] || "scripts/ghost-filmstrip-out/staged-rollout-boost-sequence-final-no-loading-1784021756507";
const out = process.argv[3] || path.join(path.dirname(prev), `reprocess-logged-in-${Date.now()}.json`);

const summaryPath = path.join(prev, "logged-in-bidirectional-prod-8dir-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const fails = (summary.directions || []).filter((d) => d.classification === "DESTINATION_LOADING_VISIBLE");
const recognized = fails.map((d) => {
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: d.classification,
    anyLoadingText: d.anyLoadingText ?? true,
    midLoadingAfterRevealCount: d.midLoadingAfterRevealCount ?? 0,
    reachedDest: true,
    visibleLoadingTextCount: d.visibleLoadingTextCount ?? 1,
  });
  return {
    dir: `${d.source}->${d.dest}`,
    midLoadingAfterRevealCount: d.midLoadingAfterRevealCount,
    gatePass: gate.pass,
    expectedFail: gate.pass === false,
    classification: d.classification,
  };
});

const freshPath = path.join(prev, "fresh-anon-exact-sequence-prod-8dir-summary.json");
const fresh = fs.existsSync(freshPath) ? JSON.parse(fs.readFileSync(freshPath, "utf8")) : null;
const targetedPath = path.join(prev, "prod-targeted-regression-summary.json");
const targeted = fs.existsSync(targetedPath) ? JSON.parse(fs.readFileSync(targetedPath, "utf8")) : null;

const report = {
  prev,
  oldRolloutRemainsFail: true,
  loggedInOldFailRecognized: recognized.every((r) => r.expectedFail) && recognized.length === 3,
  recognizedFails: recognized,
  freshAnonOldPassRecognized: fresh?.hardPass === true,
  targetedOldPassRecognized: targeted?.hardPass === true,
  expectedLabels: [
    "OLD_LOGGED_IN_BOOST_SHUFFLE_DESTINATION_LOADING_FAIL",
    "OLD_LOGGED_IN_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL",
    "OLD_LOGGED_IN_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL",
    "NEW_LOGGED_IN_POST_AUTH_STABILITY_FIX_REQUIRED",
  ],
};
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.loggedInOldFailRecognized ? 0 : 2);
